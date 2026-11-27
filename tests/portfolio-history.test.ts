import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  authorizedPortfolioCron,
  createPortfolioHistoryService,
  portfolioHistoryService,
  SAVE_POSITION_HISTORY,
} from '../lib/portfolio-history-server';
import { portfolioService } from '../lib/portfolio-server';
import type { PortfolioSnapshot } from '../lib/portfolio';
import historyHandler from '../pages/api/portfolio-history';
import cronHandler from '../pages/api/portfolio-snapshot';
import portfolioHandler from '../pages/api/portfolio';

const now = Date.parse('2026-11-27T20:00:00Z');
const asOf = '2026-11-27T19:00:00.000Z';
const env = {
  PORTFOLIO_PUBLIC_ENABLED: 'true',
  PORTFOLIO_SOURCE: 'snaptrade',
  SNAPTRADE_ACCOUNT_ID: '11111111-2222-3333-4444-555555555555',
  KV_REST_API_URL: 'https://example.upstash.io',
  KV_REST_API_TOKEN: 'PRIVATE',
};
const snapshot: PortfolioSnapshot = {
  total: 1000,
  currency: 'USD',
  incompleteHoldings: false,
  balanceAsOf: asOf,
  holdingsAsOf: asOf,
  holdings: [
    {
      symbol: 'TEST',
      name: 'Test Stock',
      percent: 40,
      marketValue: 400,
      costBasis: 300,
      unrealizedGain: 100,
    },
  ],
};
const response = (result: unknown) =>
  new Response(JSON.stringify({ result }), {
    headers: { 'content-type': 'application/json' },
  });

test('history writes only approved values and provider dates, with isolated account and environment keys', async () => {
  const calls: unknown[][] = [];
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://example.upstash.io');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.credentials, 'omit');
    assert.equal(
      new Headers(init?.headers).get('Authorization'),
      'Bearer PRIVATE'
    );
    calls.push(JSON.parse(String(init?.body)));
    return response(1);
  };
  await createPortfolioHistoryService(env, request, () => now).record(snapshot);
  const args = calls[0];
  assert.equal(args[0], 'EVAL');
  assert.equal(args[1], SAVE_POSITION_HISTORY);
  assert.equal(args[2], 1);
  assert.match(String(args[3]), /\{development:/);
  assert.equal(args[4], '2026-11-27');
  assert.deepEqual(JSON.parse(String(args.at(-1))), { asOf, value: 400 });
  assert.ok(!JSON.stringify(args).includes(env.SNAPTRADE_ACCOUNT_ID));
  assert.ok(!JSON.stringify(args).includes('costBasis'));
  assert.ok(!JSON.stringify(args).includes('PRIVATE'));
  await createPortfolioHistoryService(
    { ...env, VERCEL_ENV: 'production' },
    request,
    () => now
  ).record(snapshot);
  await createPortfolioHistoryService(
    { ...env, SNAPTRADE_ACCOUNT_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    request,
    () => now
  ).record(snapshot);
  assert.notEqual(args[3], calls[1][3]);
  assert.notEqual(args[3], calls[2][3]);
  const early = { ...snapshot, holdingsAsOf: '2026-11-27T02:00:00.000Z' };
  await createPortfolioHistoryService(env, request, () => now).record(early);
  assert.equal(calls[3][4], '2026-11-26'); // New York date, not UTC date
});

test('history gates, missing timestamps and missing values do not write fabricated points', async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    return response(1);
  };
  for (const override of [
    { PORTFOLIO_PUBLIC_ENABLED: 'false' },
    { PORTFOLIO_HISTORY_ENABLED: 'false' },
    { PORTFOLIO_SOURCE: 'manual' },
    { KV_REST_API_URL: '', KV_REST_API_TOKEN: '' },
  ]) {
    const service = createPortfolioHistoryService(
      { ...env, ...override },
      request,
      () => now
    );
    assert.equal(await service.record(snapshot), 'disabled');
    assert.equal((await service.read('TEST')).status, 'disabled');
  }
  const service = createPortfolioHistoryService(env, request, () => now);
  for (const holdingsAsOf of [
    null,
    'bad',
    '2026-11-29T00:00:00Z',
    '2024-01-01T00:00:00Z',
  ])
    assert.equal(
      await service.record({ ...snapshot, holdingsAsOf }),
      'unchanged'
    );
  assert.equal(
    await service.record({
      ...snapshot,
      holdings: [{ symbol: 'MISSING', name: 'Missing', percent: 10 }],
    }),
    'unchanged'
  );
  assert.equal(calls, 0);
});

test('Redis credential pairs never mix, invalid endpoints do not receive secrets', async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    return response(1);
  };
  for (const override of [
    { UPSTASH_REDIS_REST_URL: 'https://other.test' },
    { UPSTASH_REDIS_REST_TOKEN: 'OTHER' },
    { KV_REST_API_URL: 'http://example.upstash.io' },
    { KV_REST_API_URL: 'https://user:secret@example.upstash.io/path' },
    { PORTFOLIO_HISTORY_NAMESPACE: '../bad' },
  ])
    assert.equal(
      await createPortfolioHistoryService(
        { ...env, ...override },
        request,
        () => now
      ).record(snapshot),
      'unavailable'
    );
  assert.equal(calls, 0);
});

test('history reads sort observations, bound retention and strip extra stored fields', async () => {
  const service = createPortfolioHistoryService(
    env,
    async () =>
      response([
        '2026-11-27',
        JSON.stringify({ asOf, value: 400, account: 'PRIVATE' }),
        '2024-10-01',
        JSON.stringify({ asOf: '2024-10-01T20:00:00Z', value: 10 }),
        '2026-11-25',
        JSON.stringify({ asOf: '2026-11-25T20:00:00Z', value: -20 }),
      ]),
    () => now
  );
  assert.deepEqual(await service.read('TEST'), {
    status: 'available',
    symbol: 'TEST',
    points: [
      { asOf: '2026-11-25T20:00:00.000Z', value: -20 },
      { asOf, value: 400 },
    ],
  });
  assert.deepEqual(
    (
      await createPortfolioHistoryService(
        env,
        async () => response([]),
        () => now
      ).read('TEST')
    ).points,
    []
  );
});

test('storage errors and corrupt histories stay unavailable, never zero or fabricated success', async () => {
  const broken: (typeof fetch)[] = [
    async () => {
      throw new Error('PRIVATE provider error');
    },
    async () => new Response('Error', { status: 503 }),
    async () =>
      new Response(JSON.stringify({ error: 'PRIVATE' }), {
        headers: { 'content-type': 'application/json' },
      }),
    async () => response(['2026-11-27', '{bad']),
    async () => response(['2026-11-27', JSON.stringify({ asOf, value: null })]),
    async () => response(['2026-11-26', JSON.stringify({ asOf, value: 4 })]),
    async () => response('x'.repeat(100_001)),
  ];
  for (const fetcher of broken) {
    const service = createPortfolioHistoryService(env, fetcher, () => now);
    assert.deepEqual(await service.read('TEST'), {
      status: 'unavailable',
      symbol: 'TEST',
      points: [],
    });
    assert.equal(await service.record(snapshot), 'unavailable');
  }
});

test('scheduled capture requires the configured secret, never an empty bearer', () => {
  for (const [header, secret] of [
    [undefined, undefined],
    ['Bearer undefined', undefined],
    ['Bearer short', 'short'],
    ['Bearer wrong', 'a'.repeat(32)],
  ])
    assert.equal(authorizedPortfolioCron(header, secret), false);
  assert.equal(
    authorizedPortfolioCron(`Bearer ${'a'.repeat(32)}`, 'a'.repeat(32)),
    true
  );
});

async function invoke(
  handler: typeof historyHandler,
  overrides: Record<string, unknown> = {}
) {
  const result = {
    code: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
  };
  const req = { method: 'GET', query: {}, headers: {}, ...overrides };
  const res = {
    setHeader(k: string, v: string) {
      result.headers[k] = v;
    },
    status(code: number) {
      result.code = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  await handler(req as NextApiRequest, res as unknown as NextApiResponse);
  return result;
}

test('API boundaries limit history to public holdings and current data survives history storage failure', async () => {
  const read = portfolioService.read,
    historyRead = portfolioHistoryService.read,
    record = portfolioHistoryService.record;
  let reads = 0;
  const checkedAt = new Date().toISOString();
  portfolioService.read = async () => ({
    status: 'available',
    mode: 'synced',
    snapshot,
    checkedAt,
    stale: false,
  });
  portfolioHistoryService.read = async (symbol) => {
    reads++;
    return { status: 'available', symbol, points: [] };
  };
  portfolioHistoryService.record = async () => 'unavailable';
  try {
    assert.equal((await invoke(historyHandler, { method: 'POST' })).code, 405);
    for (const query of [
      {},
      { symbol: ['TEST', 'OTHER'] },
      { symbol: 'TEST', accountId: 'private' },
    ])
      assert.equal((await invoke(historyHandler, { query })).code, 400);
    assert.equal(
      (await invoke(historyHandler, { query: { symbol: 'OTHER' } })).code,
      404
    );
    assert.equal(reads, 0);
    const valid = await invoke(historyHandler, { query: { symbol: 'TEST' } });
    assert.equal(valid.code, 200);
    assert.equal(reads, 1);
    assert.equal(
      valid.headers['Cache-Control'],
      'public, max-age=0, s-maxage=60'
    );
    assert.equal((await invoke(portfolioHandler)).code, 200);
    assert.deepEqual((await invoke(portfolioHandler)).body, {
      status: 'available',
      mode: 'synced',
      snapshot,
      checkedAt: (await portfolioService.read()).checkedAt,
      stale: false,
    });
    portfolioService.read = async () => ({
      status: 'unconfigured',
      mode: null,
      snapshot: null,
      checkedAt: null,
      stale: false,
    });
    const disabled = await invoke(historyHandler, {
      query: { symbol: 'TEST' },
    });
    assert.equal(disabled.code, 404);
    assert.equal(disabled.headers['Cache-Control'], 'no-store');
    assert.equal(reads, 1);
    assert.equal((await invoke(cronHandler)).code, 401);
    assert.equal((await invoke(cronHandler, { method: 'POST' })).code, 405);
  } finally {
    portfolioService.read = read;
    portfolioHistoryService.read = historyRead;
    portfolioHistoryService.record = record;
  }
});

test('authenticated scheduled capture saves normalized positions and reports storage failure without leaking records', async () => {
  const config = {
    ...env,
    CRON_SECRET: 'test-secret-abcdefghijklmnopqrstuvwxyz',
    SNAPTRADE_CLIENT_ID: 'private-client',
    SNAPTRADE_CONSUMER_KEY: 'private-key',
    PORTFOLIO_HISTORY_ENABLED: 'true',
  };
  const previous = Object.fromEntries(
    Object.keys(config).map((key) => [key, process.env[key]])
  );
  const oldFetch = globalThis.fetch,
    oldRecord = portfolioHistoryService.record;
  let calls = 0,
    saveStatus: 'saved' | 'unavailable' = 'saved';
  Object.assign(process.env, config);
  globalThis.fetch = async (url) => {
    calls++;
    assert.equal(new URL(String(url)).origin, 'https://api.snaptrade.com');
    const data = String(url).includes('/details')
      ? {
          id: env.SNAPTRADE_ACCOUNT_ID,
          kind: 'investment',
          is_paper: false,
          net_value: { amount: 100, currency: 'USD' },
          sync_status: { positions: asOf, balances: asOf },
          number: 'PRIVATE',
        }
      : {
          data_freshness: { as_of: asOf },
          results: [
            {
              instrument: {
                symbol: 'TEST',
                kind: 'stock',
                description: 'Synthetic Stock',
              },
              units: '1',
              price: '5',
              cost_basis: '2',
              currency: 'USD',
              tax_lots: ['PRIVATE'],
            },
          ],
        };
    return new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json' },
    });
  };
  portfolioHistoryService.record = async (data) => {
    assert.equal(data.holdings[0].marketValue, 5);
    assert.equal(data.holdings[0].unrealizedGain, 3);
    assert.ok(!JSON.stringify(data).includes('PRIVATE'));
    return saveStatus;
  };
  const request = {
    headers: { authorization: `Bearer ${config.CRON_SECRET}` },
  };
  try {
    assert.equal(
      (
        await invoke(cronHandler, {
          ...request,
          query: { accountId: 'another' },
        })
      ).code,
      400
    );
    process.env.PORTFOLIO_PUBLIC_ENABLED = 'false';
    assert.deepEqual((await invoke(cronHandler, request)).body, {
      status: 'disabled',
    });
    assert.equal(calls, 0);
    process.env.PORTFOLIO_PUBLIC_ENABLED = 'true';
    const saved = await invoke(cronHandler, request);
    assert.equal(saved.code, 200);
    assert.deepEqual(saved.body, { status: 'saved' });
    assert.equal(calls, 2);
    saveStatus = 'unavailable';
    const unavailable = await invoke(cronHandler, request);
    assert.equal(unavailable.code, 503);
    assert.deepEqual(unavailable.body, { status: 'unavailable' });
  } finally {
    globalThis.fetch = oldFetch;
    portfolioHistoryService.record = oldRecord;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
