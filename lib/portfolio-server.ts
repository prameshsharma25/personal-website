// Server only. The route exposes selected public fields, never account records.
import { createHmac } from 'node:crypto';
import {
  TRANSACTION_PAGE_SIZE,
  TRANSACTION_TYPES,
  validTransactionOffset,
} from './portfolio-transactions';
import {
  emptyPortfolio,
  PORTFOLIO_REFRESH_MS,
  type PortfolioReport,
  type PortfolioSnapshot,
  type PublicHolding,
} from './portfolio';

type Env = Record<string, string | undefined>;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const STOCK_KINDS = new Set([
  'stock',
  'etf',
  'preferred_stock',
  'adr',
  'mutualfund',
  'cef',
]);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function numeric(value: unknown): number | null {
  if (
    typeof value !== 'number' &&
    !(typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= 1e12 ? n : null;
}
function timestamp(value: unknown, now: number): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value))
    return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now + 60_000
    ? new Date(time).toISOString()
    : null;
}
function label(value: unknown, max: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new Error('Invalid label');
  return value.trim();
}
const round = (n: number) => Math.round(n * 100) / 100;

// The accounts listing can still use the legacy array while account detail
// and position endpoints return the current schema. Used only by local setup.
export function portfolioAccounts(
  raw: unknown
): { id: string; label: string }[] {
  const accounts = Array.isArray(raw) ? raw : record(raw).results;
  if (!Array.isArray(accounts)) throw new Error('Invalid account list');
  return accounts
    .map(record)
    .filter(
      (account) =>
        account.is_paper === false &&
        (account.kind === 'investment' ||
          (!account.kind && account.account_category === 'INVESTMENT')) &&
        typeof account.id === 'string' &&
        UUID.test(account.id)
    )
    .map((account) => ({
      id: String(account.id),
      label: label(
        account.display_name || account.name || 'Investment Account',
        180
      ),
    }));
}

export function normalizeSnapTrade(
  details: unknown,
  positions: unknown,
  accountId: string,
  now = Date.now()
): PortfolioSnapshot {
  const account = record(details),
    data = record(positions),
    value = record(account.net_value);
  const total = numeric(value.amount);
  if (
    account.id !== accountId ||
    account.kind !== 'investment' ||
    account.is_paper !== false ||
    (account.status && account.status !== 'open') ||
    value.currency !== 'USD' ||
    total === null ||
    !Array.isArray(data.results) ||
    data.results.length > 1000
  )
    throw new Error('Unsupported portfolio');
  const holdings = new Map<
    string,
    {
      symbol: string;
      name: string;
      marketValue: number;
      costBasis: number | null;
      gain: number | null;
      side: 'long' | 'short' | 'mixed';
    }
  >();
  let incompleteHoldings = false;
  for (const raw of data.results) {
    const position = record(raw),
      instrument = record(position.instrument);
    const units = numeric(position.units),
      price = numeric(position.price);
    // Other assets remain in net account value, but are not mislabeled as stocks.
    if (
      !STOCK_KINDS.has(String(instrument.kind)) ||
      position.currency !== 'USD' ||
      units === null ||
      price === null ||
      price < 0
    ) {
      incompleteHoldings = true;
      continue;
    }
    if (units === 0) continue;
    const symbol = label(instrument.symbol, 40);
    const name = instrument.description
      ? label(instrument.description, 180)
      : symbol;
    const marketValue = units * price;
    if (!Number.isFinite(marketValue) || Math.abs(marketValue) > 1e12)
      throw new Error('Invalid position value');
    const percent = total > 0 ? (marketValue / total) * 100 : null;
    if (
      percent !== null &&
      (!Number.isFinite(percent) || Math.abs(percent) > 1e6)
    )
      throw new Error('Invalid allocation');
    const previous = holdings.get(symbol);
    const averageCost = numeric(position.cost_basis);
    const basis =
      averageCost !== null && averageCost >= 0
        ? Math.abs(units) * averageCost
        : null;
    if (basis !== null && (!Number.isFinite(basis) || basis > 1e12))
      throw new Error('Invalid cost basis');
    const side = units < 0 ? 'short' : 'long';
    const gain = basis === null ? null : units * (price - averageCost!);
    holdings.set(symbol, {
      symbol,
      name,
      marketValue: (previous?.marketValue ?? 0) + marketValue,
      costBasis:
        basis === null || previous?.costBasis === null
          ? null
          : (previous?.costBasis ?? 0) + basis,
      gain:
        gain === null || previous?.gain === null
          ? null
          : (previous?.gain ?? 0) + gain,
      side: previous && previous.side !== side ? 'mixed' : side,
    });
  }
  const sync = record(account.sync_status);
  return {
    total: round(total),
    currency: 'USD',
    holdings: Array.from(holdings.values())
      .map((holding): PublicHolding => {
        const percent = total > 0 ? (holding.marketValue / total) * 100 : null;
        if (
          Math.abs(holding.marketValue) > 1e12 ||
          (holding.costBasis !== null && holding.costBasis > 1e12) ||
          (percent !== null && Math.abs(percent) > 1e6)
        )
          throw new Error('Invalid aggregate position');
        return {
          symbol: holding.symbol,
          name: holding.name,
          side: holding.side,
          marketValue: round(holding.marketValue),
          costBasis:
            holding.costBasis === null ? null : round(holding.costBasis),
          unrealizedGain: holding.gain === null ? null : round(holding.gain),
          unrealizedGainPercent:
            holding.gain !== null && holding.costBasis
              ? round((holding.gain / holding.costBasis) * 100)
              : null,
          percent: percent === null ? null : round(percent),
        };
      })
      .sort(
        (a, b) =>
          Math.abs(b.percent ?? 0) - Math.abs(a.percent ?? 0) ||
          a.symbol.localeCompare(b.symbol)
      ),
    balanceAsOf: timestamp(sync.balances, now),
    holdingsAsOf:
      timestamp(record(data.data_freshness).as_of, now) ??
      timestamp(sync.positions, now),
    incompleteHoldings,
  };
}

export function normalizeManual(
  raw: unknown,
  now = Date.now()
): PortfolioSnapshot {
  const data = record(raw),
    total = numeric(data.total),
    asOf = timestamp(data.asOf, now);
  if (
    total === null ||
    data.currency !== 'USD' ||
    !asOf ||
    !Array.isArray(data.holdings) ||
    data.holdings.length > 200
  )
    throw new Error('Invalid snapshot');
  const seen = new Set<string>();
  const holdings = data.holdings
    .map((rawHolding) => {
      const h = record(rawHolding),
        symbol = label(h.symbol, 40),
        name = label(h.name, 180),
        percent = numeric(h.percent);
      if (seen.has(symbol) || percent === null || Math.abs(percent) > 1e6)
        throw new Error('Invalid holding');
      seen.add(symbol);
      return { symbol, name, percent: total > 0 ? round(percent) : null };
    })
    .sort(
      (a, b) =>
        Math.abs(b.percent ?? 0) - Math.abs(a.percent ?? 0) ||
        a.symbol.localeCompare(b.symbol)
    );
  return {
    total: round(total),
    currency: 'USD',
    holdings,
    balanceAsOf: asOf,
    holdingsAsOf: asOf,
    incompleteHoldings: data.incompleteHoldings === true,
  };
}

// Personal API authentication: no userId, userSecret or brokerage login password.
// Fixed GET paths only. There is no trading or forced refresh endpoint here.
export async function snapTradeRead(
  path: string,
  env: Env,
  request: typeof fetch = fetch,
  now = Date.now(),
  transactionOptions: { offset: number } | undefined = undefined
): Promise<unknown> {
  if (
    !(
      path === '/accounts' ||
      /^\/accounts\/[a-f0-9-]{36}\/(details|positions\/all|transactions)$/.test(
        path
      )
    ) ||
    !env.SNAPTRADE_CLIENT_ID ||
    !env.SNAPTRADE_CONSUMER_KEY
  )
    throw new Error('Missing connection');
  const isTransactions = path.endsWith('/transactions');
  if (
    transactionOptions &&
    (!isTransactions ||
      Object.keys(transactionOptions).some((key) => key !== 'offset'))
  )
    throw new Error('Unsupported request options');
  const offset = transactionOptions?.offset ?? 0;
  if (isTransactions && !validTransactionOffset(offset))
    throw new Error('Invalid transaction offset');
  const query = new URLSearchParams({
    clientId: env.SNAPTRADE_CLIENT_ID,
    timestamp: String(Math.floor(now / 1000)),
    ...(isTransactions
      ? {
          type: Object.keys(TRANSACTION_TYPES).join(','),
          limit: String(TRANSACTION_PAGE_SIZE),
          offset: String(offset),
        }
      : {}),
  }).toString();
  const signature = createHmac('sha256', env.SNAPTRADE_CONSUMER_KEY)
    .update(JSON.stringify({ content: null, path, query }))
    .digest('base64');
  const response = await request(`https://api.snaptrade.com${path}?${query}`, {
    method: 'GET',
    headers: { Signature: signature, Accept: 'application/json' },
    redirect: 'error',
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('application/json') ||
    !response.body
  )
    throw new Error('Connection unavailable');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let body = '',
    size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new Error('Response too large');
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(body);
}

export function createPortfolioService(
  env: Env = process.env,
  request: typeof fetch = fetch,
  clock: () => number = Date.now
) {
  let cached: PortfolioReport | null = null,
    expires = 0,
    pending: Promise<PortfolioReport> | null = null;
  function withFreshness(report: PortfolioReport): PortfolioReport {
    const dates = report.snapshot
      ? [report.snapshot.balanceAsOf, report.snapshot.holdingsAsOf]
      : [];
    return {
      ...report,
      stale:
        report.stale ||
        dates.some(
          (date) => !date || clock() - Date.parse(date) > 36 * 60 * 60 * 1000
        ),
    };
  }
  async function load(): Promise<PortfolioReport> {
    const now = clock();
    try {
      let snapshot: PortfolioSnapshot;
      if (env.PORTFOLIO_SOURCE === 'snaptrade') {
        const id = env.SNAPTRADE_ACCOUNT_ID;
        if (!id || !UUID.test(id)) throw new Error('Choose an account');
        const [details, positions] = await Promise.all([
          snapTradeRead(`/accounts/${id}/details`, env, request, now),
          snapTradeRead(`/accounts/${id}/positions/all`, env, request, now),
        ]);
        snapshot = normalizeSnapTrade(details, positions, id, now);
      } else if (env.PORTFOLIO_SOURCE === 'manual') {
        const raw = env.PORTFOLIO_SNAPSHOT_JSON;
        if (!raw || raw.length > 100_000) throw new Error('Missing snapshot');
        snapshot = normalizeManual(JSON.parse(raw), now);
      } else throw new Error('Choose a source');
      cached = {
        status: 'available',
        mode: env.PORTFOLIO_SOURCE === 'manual' ? 'manual' : 'synced',
        snapshot,
        checkedAt: new Date(now).toISOString(),
        stale: false,
      };
      expires = clock() + PORTFOLIO_REFRESH_MS;
      return withFreshness(cached);
    } catch {
      // No credentials, provider bodies, account IDs or errors reach the visitor.
      cached = cached?.snapshot
        ? { ...cached, stale: true }
        : { ...emptyPortfolio(), status: 'unavailable' };
      expires = clock() + 60_000;
      return withFreshness(cached);
    }
  }
  return {
    async read(): Promise<PortfolioReport> {
      if (env.PORTFOLIO_PUBLIC_ENABLED !== 'true') {
        cached = null;
        expires = 0;
        return emptyPortfolio();
      }
      if (cached && clock() < expires) return withFreshness(cached);
      if (!pending)
        pending = load().finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}
export const portfolioService = createPortfolioService();
