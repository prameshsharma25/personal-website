import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  createPortfolioService,
  normalizeManual,
  normalizeSnapTrade,
  portfolioAccounts,
  snapTradeRead,
} from '../lib/portfolio-server';
import {
  contributionMonths,
  goalProgress,
  publicHttpsLink,
} from '../lib/portfolio';

const id = '11111111-2222-3333-4444-555555555555';
const now = Date.parse('2026-11-27T16:00:00Z');
const date = '2026-11-27T15:00:00Z';

test('setup lists legacy and current investment accounts without leaking the account record', () => {
  const legacy = {
    id,
    name: 'Robinhood Individual',
    account_category: 'INVESTMENT',
    is_paper: false,
    number: 'PRIVATE',
    raw_data: 'PRIVATE',
  };
  const current = {
    id,
    display_name: 'Robinhood Individual',
    kind: 'investment',
    is_paper: false,
    masked_account_number: 'PRIVATE',
  };
  assert.deepEqual(portfolioAccounts([legacy]), [
    { id, label: 'Robinhood Individual' },
  ]);
  assert.deepEqual(portfolioAccounts({ results: [current] }), [
    { id, label: 'Robinhood Individual' },
  ]);
  assert.deepEqual(
    portfolioAccounts([
      { ...legacy, is_paper: true },
      { ...current, kind: 'deposit' },
      { ...legacy, account_category: 'BANKING' },
      { ...current, id: 'bad' },
    ]),
    []
  );
  assert.throws(() => portfolioAccounts({ accounts: [legacy] }));
});
const env = {
  PORTFOLIO_PUBLIC_ENABLED: 'true',
  PORTFOLIO_SOURCE: 'snaptrade',
  SNAPTRADE_CLIENT_ID: 'private-client',
  SNAPTRADE_CONSUMER_KEY: 'private-key',
  SNAPTRADE_ACCOUNT_ID: id,
};
const details = {
  id,
  kind: 'investment',
  is_paper: false,
  status: 'open',
  net_value: { amount: 5000, currency: 'USD' },
  sync_status: { positions: date, balances: date },
  masked_account_number: '****SECRET',
  connection_id: 'PRIVATE-ID',
};
const position = (
  symbol: string,
  units: unknown = '10',
  price: unknown = '100',
  kind = 'stock',
  currency = 'USD'
) => ({
  instrument: {
    kind,
    symbol,
    description: `${symbol} Corporation`,
    id: 'PRIVATE-INSTRUMENT',
  },
  units,
  price,
  currency,
  cost_basis: 'PRIVATE-COST',
  tax_lots: ['PRIVATE-TAX'],
});
const positions = {
  results: [position('AAA'), position('BBB', '5', '200', 'etf')],
  data_freshness: { as_of: date },
};
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });

test('portfolio publishes only allowed fields and weights use net account value including cash', () => {
  const result = normalizeSnapTrade(details, positions, id, now);
  assert.equal(result.total, 5000);
  assert.deepEqual(
    result.holdings.map((h) => h.percent),
    [20, 20]
  );
  assert.deepEqual(Object.keys(result.holdings[0]).sort(), [
    'name',
    'percent',
    'symbol',
  ]);
  const publicJson = JSON.stringify(result);
  for (const privateValue of [
    'PRIVATE',
    'SECRET',
    id,
    'cost_basis',
    'units',
    'tax_lots',
    'price',
  ])
    assert.ok(!publicJson.includes(privateValue));
  assert.equal(result.balanceAsOf, '2026-11-27T15:00:00.000Z');
});

test('missing valuations, unsupported currencies and instruments are not fabricated or used as stock weights', () => {
  const result = normalizeSnapTrade(
    details,
    {
      ...positions,
      results: [
        position('AAA'),
        position('NULL', null),
        position('BLANK', ' '),
        position('OPTION', '1', '100', 'option'),
        position('EURO', '10', '5', 'stock', 'EUR'),
        position('MISSING', '1', null),
        position('ZERO', 0),
      ],
    },
    id,
    now
  );
  assert.equal(result.holdings.length, 1);
  assert.equal(result.incompleteHoldings, true);
  assert.equal(result.holdings[0].percent, 20);
});

test('short and leveraged weights are preserved, duplicate symbols aggregated, empty accounts supported', () => {
  const result = normalizeSnapTrade(
    details,
    {
      ...positions,
      results: [
        position('AAA', 20, 500),
        position('SHORT', -10, 100),
        position('AAA', 10, 100),
      ],
    },
    id,
    now
  );
  assert.deepEqual(
    result.holdings.map((h) => h.percent),
    [220, -20]
  );
  const empty = normalizeSnapTrade(
    { ...details, net_value: { amount: 0, currency: 'USD' } },
    { ...positions, results: [] },
    id,
    now
  );
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.holdings, []);
  const negative = normalizeSnapTrade(
    { ...details, net_value: { amount: -100, currency: 'USD' } },
    positions,
    id,
    now
  );
  assert.equal(negative.holdings[0].percent, null);
});

test('wrong accounts, paper portfolios, unsupported currencies, missing totals and malformed lists fail closed', () => {
  for (const override of [
    { id: 'another' },
    { kind: 'deposit' },
    { is_paper: true },
    { is_paper: null },
    { status: 'closed' },
    { net_value: { currency: 'EUR', amount: 1 } },
    { net_value: { currency: 'USD', amount: null } },
  ]) {
    assert.throws(() =>
      normalizeSnapTrade({ ...details, ...override }, positions, id, now)
    );
  }
  assert.throws(() => normalizeSnapTrade(details, {}, id, now));
  assert.equal(
    normalizeSnapTrade(
      { ...details, sync_status: {} },
      { ...positions, data_freshness: {} },
      id,
      now
    ).balanceAsOf,
    null
  );
});

test('manual snapshots require valid dates and strip accidental extra fields', () => {
  const manual = {
    total: 1000,
    currency: 'USD',
    asOf: date,
    holdings: [
      { symbol: 'AAA', name: 'Example', percent: 25, account: 'PRIVATE' },
    ],
    key: 'PRIVATE',
  };
  assert.ok(!JSON.stringify(normalizeManual(manual, now)).includes('PRIVATE'));
  for (const asOf of [null, '', 'bad', '2026-12-01T00:00:00Z'])
    assert.throws(() => normalizeManual({ ...manual, asOf }, now));
  assert.throws(() =>
    normalizeManual(
      { ...manual, holdings: [...manual.holdings, ...manual.holdings] },
      now
    )
  );
});

test('server signs documented Personal API GETs and never sends credentials to another host', async () => {
  let calls = 0;
  const request: typeof fetch = async (url, init) => {
    calls++;
    const address = new URL(String(url));
    assert.equal(address.origin, 'https://api.snaptrade.com');
    assert.equal(address.pathname, `/accounts/${id}/details`);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.ok(!address.searchParams.has('userId'));
    assert.ok(!address.searchParams.has('userSecret'));
    const expected = createHmac('sha256', env.SNAPTRADE_CONSUMER_KEY)
      .update(
        JSON.stringify({
          content: null,
          path: address.pathname,
          query: address.search.slice(1),
        })
      )
      .digest('base64');
    assert.equal(new Headers(init.headers).get('Signature'), expected);
    return response(details);
  };
  await snapTradeRead(`/accounts/${id}/details`, env, request, now);
  for (const path of [
    'https://evil.test',
    `/accounts/${id}/trading/simple`,
    '/authorizations',
    '/accounts?foo=bar',
  ])
    await assert.rejects(() => snapTradeRead(path, env, request, now));
  assert.equal(calls, 1);
});

test('publication gate prevents all provider requests; concurrent reads share a five minute cache', async () => {
  let calls = 0,
    time = now;
  const request: typeof fetch = async (url) => {
    calls++;
    return response(String(url).includes('/details') ? details : positions);
  };
  assert.equal(
    (
      await createPortfolioService(
        { ...env, PORTFOLIO_PUBLIC_ENABLED: 'false' },
        request
      ).read()
    ).status,
    'unconfigured'
  );
  assert.equal(calls, 0);
  const service = createPortfolioService(env, request, () => time);
  const reports = await Promise.all([
    service.read(),
    service.read(),
    service.read(),
  ]);
  assert.equal(calls, 2);
  assert.equal(reports[0].status, 'available');
  time += 299000;
  await service.read();
  assert.equal(calls, 2);
  time += 2000;
  await service.read();
  assert.equal(calls, 4);
});

test('outages retain an explicitly stale snapshot or show unavailable, without exposing provider errors', async () => {
  let fail = false,
    time = now;
  const request: typeof fetch = async (url) => {
    if (fail) throw new Error('PRIVATE account credentials');
    return response(String(url).includes('/details') ? details : positions);
  };
  const service = createPortfolioService(env, request, () => time);
  const first = await service.read();
  fail = true;
  time += 301000;
  const fallback = await service.read();
  assert.equal(fallback.snapshot.total, 5000);
  assert.equal(fallback.stale, true);
  assert.equal(fallback.checkedAt, first.checkedAt);
  const unavailable = await createPortfolioService(
    env,
    request,
    () => time
  ).read();
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.snapshot, null);
  assert.ok(!JSON.stringify(unavailable).includes('PRIVATE'));
});

test('old and unknown sync timestamps are flagged even after a successful API fetch', async () => {
  const request: typeof fetch = async (url) =>
    response(
      String(url).includes('/details')
        ? { ...details, sync_status: {} }
        : positions
    );
  assert.equal(
    (await createPortfolioService(env, request, () => now).read()).stale,
    true
  );
  const manualEnv = {
    PORTFOLIO_PUBLIC_ENABLED: 'true',
    PORTFOLIO_SOURCE: 'manual',
    PORTFOLIO_SNAPSHOT_JSON: JSON.stringify({
      total: 1,
      currency: 'USD',
      asOf: '2026-11-20T00:00:00Z',
      holdings: [],
    }),
  };
  const manual = await createPortfolioService(
    manualEnv,
    request,
    () => now
  ).read();
  assert.equal(manual.mode, 'manual');
  assert.equal(manual.stale, true);
});

test('response bounds and content types fail safely', async () => {
  for (const responseValue of [
    new Response('x', { status: 500 }),
    new Response('html'),
    new Response(' '.repeat(2_000_001), {
      headers: { 'content-type': 'application/json' },
    }),
  ]) {
    await assert.rejects(() =>
      snapTradeRead('/accounts', env, async () => responseValue, now)
    );
  }
});

test('contribution arithmetic handles zero, negatives and goals above the target', () => {
  assert.equal(contributionMonths(2500, 100), 75);
  assert.equal(contributionMonths(9999, 100), 1);
  assert.equal(contributionMonths(10001, 0), 0);
  assert.equal(contributionMonths(100, 0), null);
  assert.equal(contributionMonths(-100, 100), 101);
  assert.equal(contributionMonths(100, -1), null);
  assert.equal(contributionMonths(NaN, 1), null);
  assert.deepEqual(goalProgress(12500), {
    percent: 100,
    remaining: 0,
    reached: true,
  });
  assert.equal(goalProgress(-100).percent, 0);
});

test('support links allow only explicit HTTPS referral hosts', () => {
  assert.equal(
    publicHttpsLink('https://join.robinhood.com/example', ['robinhood.com']),
    'https://join.robinhood.com/example'
  );
  for (const url of [
    'javascript:alert(1)',
    'http://robinhood.com',
    'https://robinhood.com.evil.test',
    'https://evilrobinhood.com',
    'https://user:pass@robinhood.com',
  ])
    assert.equal(publicHttpsLink(url, ['robinhood.com']), null);
});
