// Server only. Store approved position totals, never raw brokerage records.
import { createHash, timingSafeEqual } from 'node:crypto';
import type {
  PortfolioSnapshot,
  PositionHistory,
  PositionObservation,
} from './portfolio';

type Env = Record<string, string | undefined>;
const DAY = 86_400_000;
const RETENTION = 366;
const dayKey = (time: number) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(time);
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');

// Latest observation for each New York calendar day wins, even if requests
// finish out of order. Stale provider snapshots cannot invent new chart dates.
export const SAVE_POSITION_HISTORY = `
local changed = 0
for i, key in ipairs(KEYS) do
  local old = redis.call('HGET', key, ARGV[1])
  local point = cjson.decode(ARGV[i + 3])
  if not old or cjson.decode(old).asOf < point.asOf then
    redis.call('HSET', key, ARGV[1], ARGV[i + 3])
    changed = changed + 1
  end
  for _, day in ipairs(redis.call('HKEYS', key)) do
    if day < ARGV[2] then redis.call('HDEL', key, day) end
  end
  redis.call('EXPIRE', key, ARGV[3])
end
return changed
`;

export function authorizedPortfolioCron(
  header: string | undefined,
  secret: string | undefined
) {
  if (!secret || secret.length < 16 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`),
    actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createPortfolioHistoryService(
  env: Env = process.env,
  request: typeof fetch = fetch,
  clock: () => number = Date.now
) {
  function configuration() {
    if (
      env.PORTFOLIO_PUBLIC_ENABLED !== 'true' ||
      env.PORTFOLIO_SOURCE !== 'snaptrade' ||
      env.PORTFOLIO_HISTORY_ENABLED === 'false'
    )
      return null;
    const explicit = Boolean(
      env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_TOKEN
    );
    const raw = explicit ? env.UPSTASH_REDIS_REST_URL : env.KV_REST_API_URL;
    const token = explicit
      ? env.UPSTASH_REDIS_REST_TOKEN
      : env.KV_REST_API_TOKEN;
    if (!raw && !token) return null;
    const namespace =
      env.PORTFOLIO_HISTORY_NAMESPACE || env.VERCEL_ENV || 'development';
    if (
      !raw ||
      !token ||
      !/^[a-z0-9-]{1,60}$/.test(namespace) ||
      !/^[a-f0-9-]{36}$/i.test(env.SNAPTRADE_ACCOUNT_ID || '')
    )
      throw new Error('Missing history configuration');
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error('Invalid history endpoint');
    const account = digest(
      `snaptrade:${env.SNAPTRADE_ACCOUNT_ID!.toLowerCase()}`
    );
    return {
      url: url.origin,
      token,
      prefix: `personal-website:portfolio:v1:{${namespace}:${account}}`,
    };
  }
  type Config = NonNullable<ReturnType<typeof configuration>>;
  async function command(config: Config, args: (string | number)[]) {
    const response = await request(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('application/json') ||
      !response.body
    )
      throw new Error('History unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = '',
      bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 100_000) throw new Error('History too large');
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const data = JSON.parse(body);
    if (
      !data ||
      typeof data !== 'object' ||
      'error' in data ||
      !('result' in data)
    )
      throw new Error('History unavailable');
    return data.result as unknown;
  }
  return {
    async record(
      snapshot: PortfolioSnapshot
    ): Promise<'saved' | 'unchanged' | 'disabled' | 'unavailable'> {
      try {
        const config = configuration();
        if (!config) return 'disabled';
        const asOf = snapshot.holdingsAsOf;
        const time = asOf ? Date.parse(asOf) : NaN;
        if (
          !Number.isFinite(time) ||
          time > clock() + 60_000 ||
          time < clock() - RETENTION * DAY
        )
          return 'unchanged';
        const holdings = snapshot.holdings.filter(
          (h) =>
            typeof h.marketValue === 'number' && Number.isFinite(h.marketValue)
        );
        if (!holdings.length) return 'unchanged';
        if (holdings.length > 1000) throw new Error('Too many positions');
        const result = await command(config, [
          'EVAL',
          SAVE_POSITION_HISTORY,
          holdings.length,
          ...holdings.map((h) => `${config.prefix}:${digest(h.symbol)}`),
          dayKey(time),
          dayKey(clock() - (RETENTION - 1) * DAY),
          String(400 * 86400),
          ...holdings.map((h) =>
            JSON.stringify({
              asOf: new Date(time).toISOString(),
              value: h.marketValue,
            })
          ),
        ]);
        if (
          !Number.isSafeInteger(result) ||
          Number(result) < 0 ||
          Number(result) > holdings.length
        )
          throw new Error('Invalid history result');
        return result === 0 ? 'unchanged' : 'saved';
      } catch {
        return 'unavailable';
      }
    },
    async read(symbol: string): Promise<PositionHistory> {
      const empty = (status: PositionHistory['status']): PositionHistory => ({
        status,
        symbol,
        points: [],
      });
      try {
        const config = configuration();
        if (!config) return empty('disabled');
        if (!symbol || symbol.length > 40 || /[\u0000-\u001f]/.test(symbol))
          return empty('unavailable');
        const raw = await command(config, [
          'HGETALL',
          `${config.prefix}:${digest(symbol)}`,
        ]);
        if (!Array.isArray(raw) || raw.length % 2 || raw.length > 800)
          throw new Error('Invalid history');
        const points: PositionObservation[] = [];
        const cutoff = dayKey(clock() - (RETENTION - 1) * DAY);
        for (let i = 0; i < raw.length; i += 2) {
          if (
            typeof raw[i] !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(raw[i]) ||
            typeof raw[i + 1] !== 'string'
          )
            throw new Error('Invalid history');
          const point = JSON.parse(raw[i + 1]);
          const time =
            typeof point?.asOf === 'string' ? Date.parse(point.asOf) : NaN;
          if (
            !Number.isFinite(time) ||
            time > clock() + 60_000 ||
            dayKey(time) !== raw[i] ||
            typeof point?.value !== 'number' ||
            !Number.isFinite(point.value) ||
            Math.abs(point.value) > 1e12
          )
            throw new Error('Invalid observation');
          if (raw[i] >= cutoff)
            points.push({
              asOf: new Date(time).toISOString(),
              value: point.value,
            });
        }
        return {
          status: 'available',
          symbol,
          points: points.sort((a, b) => a.asOf.localeCompare(b.asOf)),
        };
      } catch {
        return empty('unavailable');
      }
    },
  };
}
export const portfolioHistoryService = createPortfolioHistoryService();
