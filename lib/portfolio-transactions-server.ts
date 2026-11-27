// Server only. Raw activity descriptions can include account information.
import { createHmac } from 'node:crypto';
import { snapTradeRead } from './portfolio-server';
import { PORTFOLIO_REFRESH_MS } from './portfolio';
import {
  emptyTransactions,
  MAX_TRANSACTION_OFFSET,
  TRANSACTION_PAGE_SIZE,
  TRANSACTION_TYPES,
  validTransactionOffset,
  type PortfolioTransactions,
  type PublicTransaction,
  type TransactionType,
} from './portfolio-transactions';

type Env = Record<string, string | undefined>;
const stockKinds = new Set([
  'stock',
  'etf',
  'adr',
  'preferred_stock',
  'mutualfund',
  'cef',
]);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function text(value: unknown, max: number) {
  return typeof value === 'string' &&
    value.trim() &&
    value.length <= max &&
    !/[\u0000-\u001f]/.test(value)
    ? value.trim()
    : null;
}
function amount(value: unknown) {
  if (
    typeof value !== 'number' &&
    !(typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= 1e12
    ? Math.round(n * 100) / 100
    : null;
}
function date(value: unknown, now: number): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))
    return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time > now + 60_000) return null;
  const iso = new Date(time).toISOString();
  return iso.slice(0, 10) === value.slice(0, 10) ? iso : null;
}

export function normalizeTransactions(
  raw: unknown,
  details: unknown,
  accountId: string,
  secret: string,
  offset = 0,
  now = Date.now()
): PortfolioTransactions {
  const data = record(raw),
    account = record(details),
    pagination = record(data.pagination);
  if (
    !secret ||
    !validTransactionOffset(offset) ||
    account.id !== accountId ||
    account.kind !== 'investment' ||
    account.is_paper !== false ||
    (account.status && account.status !== 'open') ||
    !Array.isArray(data.data) ||
    data.data.length > TRANSACTION_PAGE_SIZE ||
    pagination.offset !== offset ||
    pagination.limit !== TRANSACTION_PAGE_SIZE ||
    !Number.isSafeInteger(pagination.total) ||
    Number(pagination.total) < 0 ||
    (data.data.length === 0 && Number(pagination.total) > offset)
  )
    throw new Error('Unsupported transaction response');
  const transactions: PublicTransaction[] = [],
    seen = new Set<string>();
  let omitted = false;
  for (const rawRow of data.data) {
    const row = record(rawRow),
      instrument = record(row.instrument),
      currency = record(row.priced_in);
    const symbol = text(instrument.symbol, 40),
      name = text(instrument.description, 180) || symbol;
    const id = text(row.transaction_id, 256),
      observed = date(row.date, now);
    if (
      !Object.hasOwn(TRANSACTION_TYPES, String(row.type)) ||
      !stockKinds.has(String(instrument.kind)) ||
      currency.kind !== 'cash' ||
      currency.code !== 'USD' ||
      !symbol ||
      !name ||
      !id ||
      !observed
    ) {
      omitted = true;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    transactions.push({
      id: createHmac('sha256', secret)
        .update(JSON.stringify([accountId, id]))
        .digest('hex')
        .slice(0, 32),
      date: observed.slice(0, 10),
      type: row.type as TransactionType,
      symbol,
      name,
      amount: amount(row.amount),
      currency: 'USD',
    });
  }
  const sync = record(record(account.sync_status).transactions);
  const syncedThrough =
    date(sync.last_successful_sync, now)?.slice(0, 10) ?? null;
  const next = offset + TRANSACTION_PAGE_SIZE;
  return {
    status: 'available',
    transactions: transactions.sort((a, b) => b.date.localeCompare(a.date)),
    nextOffset:
      data.data.length === TRANSACTION_PAGE_SIZE &&
      next < Number(pagination.total) &&
      next <= MAX_TRANSACTION_OFFSET
        ? next
        : null,
    syncedThrough,
    syncComplete:
      typeof sync.initial_sync_completed === 'boolean'
        ? sync.initial_sync_completed
        : null,
    checkedAt: new Date(now).toISOString(),
    stale: !syncedThrough || now - Date.parse(syncedThrough) > 3 * 86400000,
    omitted,
  };
}

export function createTransactionsService(
  env: Env = process.env,
  request: typeof fetch = fetch,
  clock: () => number = Date.now
) {
  const cache = new Map<
    number,
    { report: PortfolioTransactions; expires: number }
  >();
  const pending = new Map<number, Promise<PortfolioTransactions>>();
  return {
    async read(offset = 0): Promise<PortfolioTransactions> {
      if (
        env.PORTFOLIO_PUBLIC_ENABLED !== 'true' ||
        env.PORTFOLIO_TRANSACTIONS_ENABLED === 'false' ||
        env.PORTFOLIO_SOURCE !== 'snaptrade'
      ) {
        cache.clear();
        return emptyTransactions();
      }
      if (!validTransactionOffset(offset))
        return emptyTransactions('unavailable');
      const previous = cache.get(offset);
      if (previous && clock() < previous.expires) return previous.report;
      if (pending.has(offset)) return pending.get(offset)!;
      const promise = (async () => {
        const now = clock();
        let report: PortfolioTransactions;
        try {
          const id = env.SNAPTRADE_ACCOUNT_ID;
          if (
            !id ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              id
            )
          )
            throw new Error('Missing selected account');
          const [raw, details] = await Promise.all([
            snapTradeRead(`/accounts/${id}/transactions`, env, request, now, {
              offset,
            }),
            snapTradeRead(`/accounts/${id}/details`, env, request, now),
          ]);
          report = normalizeTransactions(
            raw,
            details,
            id,
            env.SNAPTRADE_CONSUMER_KEY!,
            offset,
            now
          );
        } catch {
          report = previous
            ? { ...previous.report, stale: true }
            : emptyTransactions('unavailable');
        }
        cache.delete(offset);
        cache.set(offset, {
          report,
          expires:
            clock() +
            (report.status === 'available' && !report.stale
              ? PORTFOLIO_REFRESH_MS
              : 60_000),
        });
        while (cache.size > 20) cache.delete(cache.keys().next().value!);
        return report;
      })().finally(() => pending.delete(offset));
      pending.set(offset, promise);
      return promise;
    },
  };
}
export const transactionsService = createTransactionsService();
