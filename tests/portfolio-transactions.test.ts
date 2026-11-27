import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  normalizeTransactions,
  createTransactionsService,
  transactionsService,
} from '../lib/portfolio-transactions-server';
import { snapTradeRead } from '../lib/portfolio-server';
import {
  emptyTransactions,
  TRANSACTION_TYPES,
} from '../lib/portfolio-transactions';
import handler from '../pages/api/portfolio-transactions';

const now = Date.parse('2026-11-27T20:00:00Z');
const id = '11111111-2222-3333-4444-555555555555';
const env = {
  PORTFOLIO_PUBLIC_ENABLED: 'true',
  PORTFOLIO_SOURCE: 'snaptrade',
  SNAPTRADE_ACCOUNT_ID: id,
  SNAPTRADE_CLIENT_ID: 'PRIVATE-CLIENT',
  SNAPTRADE_CONSUMER_KEY: 'PRIVATE-KEY',
};
const details = {
  id,
  kind: 'investment',
  is_paper: false,
  status: 'open',
  sync_status: {
    transactions: {
      initial_sync_completed: true,
      last_successful_sync: '2026-11-26',
    },
  },
  account_number: 'PRIVATE-NUMBER',
};
const row = (
  transaction_id = 'PRIVATE-TRANSACTION',
  overrides: Record<string, unknown> = {}
) => ({
  transaction_id,
  type: 'BUY',
  date: '2026-11-26T18:00:00Z',
  description: 'PRIVATE brokerage memo',
  instrument: {
    kind: 'stock',
    symbol: 'TEST',
    description: 'Example Stock',
    id: 'PRIVATE-INSTRUMENT',
    currency: 'USD',
  },
  priced_in: { kind: 'cash', code: 'USD' },
  amount: '-100.25',
  units: '0.25',
  price: '401',
  fee: '0',
  ...overrides,
});
const page = (rows = [row()], offset = 0, total = rows.length) => ({
  data: rows,
  pagination: { offset, limit: 50, total },
});
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  });

test('transaction normalization exposes only approved fields and preserves cash direction', () => {
  const result = normalizeTransactions(
    page([
      row(),
      row('sale', {
        type: 'SELL',
        amount: '200.50',
        date: '2026-11-27T15:00:00Z',
      }),
      row('dividend', { type: 'DIVIDEND', amount: '.35' }),
    ]),
    details,
    id,
    env.SNAPTRADE_CONSUMER_KEY,
    0,
    now
  );
  assert.deepEqual(
    result.transactions.map((t) => [t.type, t.amount]),
    [
      ['SELL', 200.5],
      ['BUY', -100.25],
      ['DIVIDEND', null],
    ]
  );
  assert.deepEqual(Object.keys(result.transactions[0]).sort(), [
    'amount',
    'currency',
    'date',
    'id',
    'name',
    'symbol',
    'type',
  ]);
  assert.equal(result.syncedThrough, '2026-11-26');
  assert.equal(result.syncComplete, true);
  assert.equal(result.stale, false);
  assert.match(result.transactions[0].id, /^[a-f0-9]{32}$/);
  for (const value of ['PRIVATE', 'units', 'price', 'description', id])
    assert.ok(!JSON.stringify(result).includes(value));
  assert.equal(
    result.transactions[1].id,
    normalizeTransactions(
      page(),
      details,
      id,
      env.SNAPTRADE_CONSUMER_KEY,
      0,
      now
    ).transactions[0].id
  );
});

test('source IDs deduplicate without collapsing distinct identical trades', () => {
  const result = normalizeTransactions(
    page([row('one'), row('one'), row('two')]),
    details,
    id,
    'secret',
    0,
    now
  );
  assert.equal(result.transactions.length, 2);
  assert.notEqual(result.transactions[0].id, result.transactions[1].id);
});

test('only supported USD stock activity is public; invalid dates and sensitive cash activity are omitted', () => {
  const examples = [
    row('deposit', { type: 'CONTRIBUTION' }),
    row('wire', { type: 'TRANSFER' }),
    row('fee', { type: 'FEE' }),
    row('euro', { priced_in: { kind: 'cash', code: 'EUR' } }),
    row('missing-currency', { priced_in: null }),
    row('crypto', { instrument: { kind: 'crypto', symbol: 'BTC' } }),
    row('option', { instrument: { kind: 'option', symbol: 'TEST' } }),
    row('bad-date', { date: '2026-02-30' }),
    row('future', { date: '2027-01-01' }),
    row('bad-label', { instrument: { kind: 'stock', symbol: 'bad\nlabel' } }),
  ];
  const result = normalizeTransactions(
    page([row(), ...examples]),
    details,
    id,
    'secret',
    0,
    now
  );
  assert.equal(result.transactions.length, 1);
  assert.equal(result.omitted, true);
  for (const amount of [null, '', true, 'NaN', 'Infinity'])
    assert.equal(
      normalizeTransactions(
        page([row('missing', { amount })]),
        details,
        id,
        'secret',
        0,
        now
      ).transactions[0].amount,
      null
    );
  for (const type of ['DIVIDEND', 'SUBSTITUTE_DIVIDEND', 'REI'])
    assert.equal(
      normalizeTransactions(
        page([row('allowed', { type, amount: '0.35' })]),
        details,
        id,
        'secret',
        0,
        now
      ).transactions[0].amount,
      0.35
    );
});

test('pagination uses source rows even when records are omitted, with explicit sync states', () => {
  const rows = Array.from({ length: 50 }, (_, i) =>
    row(String(i), { type: 'CONTRIBUTION' })
  );
  const first = normalizeTransactions(
    page(rows, 0, 100),
    details,
    id,
    'secret',
    0,
    now
  );
  assert.equal(first.transactions.length, 0);
  assert.equal(first.nextOffset, 50);
  const last = normalizeTransactions(
    page([row()], 50, 51),
    {
      ...details,
      sync_status: { transactions: { initial_sync_completed: false } },
    },
    id,
    'secret',
    50,
    now
  );
  assert.equal(last.nextOffset, null);
  assert.equal(last.syncComplete, false);
  assert.equal(last.stale, true);
  for (const raw of [
    {},
    page([], 0, 10),
    page([row()], 50),
    { ...page(), pagination: { offset: 0, limit: 50, total: '1' } },
  ])
    assert.throws(() =>
      normalizeTransactions(raw, details, id, 'secret', 0, now)
    );
  for (const override of [
    { id: 'another' },
    { kind: 'deposit' },
    { is_paper: true },
    { status: 'closed' },
  ])
    assert.throws(() =>
      normalizeTransactions(
        page(),
        { ...details, ...override },
        id,
        'secret',
        0,
        now
      )
    );
});

test('transaction GET signatures include only fixed filters and a bounded numeric offset', async () => {
  let calls = 0;
  const request: typeof fetch = async (url, init) => {
    calls++;
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, 'https://api.snaptrade.com');
    assert.equal(parsed.pathname, `/accounts/${id}/transactions`);
    assert.equal(
      parsed.searchParams.get('type'),
      Object.keys(TRANSACTION_TYPES).join(',')
    );
    assert.equal(parsed.searchParams.get('offset'), '50');
    assert.equal(parsed.searchParams.get('limit'), '50');
    const signature = createHmac('sha256', env.SNAPTRADE_CONSUMER_KEY)
      .update(
        JSON.stringify({
          content: null,
          path: parsed.pathname,
          query: parsed.search.slice(1),
        })
      )
      .digest('base64');
    assert.equal(new Headers(init?.headers).get('Signature'), signature);
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');
    return json(page([row()], 50, 51));
  };
  await snapTradeRead(`/accounts/${id}/transactions`, env, request, now, {
    offset: 50,
  });
  for (const offset of [-1, 1, Infinity, 100050, '50' as unknown as number])
    await assert.rejects(() =>
      snapTradeRead(`/accounts/${id}/transactions`, env, request, now, {
        offset,
      })
    );
  await assert.rejects(() =>
    snapTradeRead(`/accounts/${id}/details`, env, request, now, { offset: 50 })
  );
  await assert.rejects(() =>
    snapTradeRead(`/accounts/${id}/transactions`, env, request, now, {
      offset: 0,
      accountId: 'another',
    } as { offset: number })
  );
  assert.equal(calls, 1);
});

test('service gates publication, coalesces cache reads and retains stale data on outage', async () => {
  let calls = 0,
    clock = now,
    fail = false;
  const settings = { ...env };
  const request: typeof fetch = async (url) => {
    calls++;
    if (fail) throw new Error('PRIVATE');
    return json(String(url).includes('/transactions') ? page() : details);
  };
  for (const override of [
    { PORTFOLIO_PUBLIC_ENABLED: 'false' },
    { PORTFOLIO_TRANSACTIONS_ENABLED: 'false' },
    { PORTFOLIO_SOURCE: 'manual' },
  ]) {
    assert.equal(
      (await createTransactionsService({ ...env, ...override }, request).read())
        .status,
      'disabled'
    );
  }
  assert.equal(calls, 0);
  const service = createTransactionsService(settings, request, () => clock);
  const responses = await Promise.all([service.read(), service.read()]);
  assert.equal(calls, 2);
  assert.equal(responses[0].transactions.length, 1);
  assert.deepEqual(responses[0], responses[1]);
  await service.read();
  assert.equal(calls, 2);
  clock += 301000;
  fail = true;
  const stale = await service.read();
  assert.equal(stale.stale, true);
  assert.equal(stale.transactions.length, 1);
  assert.equal(stale.checkedAt, responses[0].checkedAt);
  settings.PORTFOLIO_PUBLIC_ENABLED = 'false';
  assert.deepEqual(await service.read(), emptyTransactions());
  assert.deepEqual(
    await createTransactionsService(env, request, () => clock).read(),
    emptyTransactions('unavailable')
  );
});

test('public transaction API accepts pagination but no account, source, or provider filters', async () => {
  const original = transactionsService.read;
  let calls = 0;
  transactionsService.read = async (offset) => {
    calls++;
    assert.equal(offset, 50);
    return {
      ...emptyTransactions(),
      status: 'available',
      checkedAt: new Date().toISOString(),
    };
  };
  async function invoke(query: unknown, method = 'GET') {
    const result = {
      code: 0,
      body: null as unknown,
      headers: {} as Record<string, string>,
    };
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
    await handler(
      { method, query } as NextApiRequest,
      res as unknown as NextApiResponse
    );
    return result;
  }
  try {
    assert.equal((await invoke({}, 'POST')).code, 405);
    for (const query of [
      { offset: ['0'] },
      { offset: '-1' },
      { offset: '1' },
      { offset: '1e2' },
      { offset: '100050' },
      { accountId: 'other' },
      { type: 'TRANSFER' },
      { limit: '10000' },
    ])
      assert.equal((await invoke(query)).code, 400);
    assert.equal(calls, 0);
    const result = await invoke({ offset: '50' });
    assert.equal(result.code, 200);
    assert.match(result.headers['Cache-Control'], /s-maxage=\d+/);
    assert.equal(calls, 1);
  } finally {
    transactionsService.read = original;
  }
});
