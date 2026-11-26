// Server only. Read public aggregate counts without a Substack session or credentials.
import {
  SUBSTACK_ORIGIN,
  publicPostSlug,
  emptySubstackStats,
  parseSubstackStats,
  type SubstackStats,
} from './substack-stats';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const RETRY = 5 * 60 * 1000;
const LIMIT = 2 * 1024 * 1024;

export function createSubstackStatsService(
  request: typeof fetch = fetch,
  now = () => Date.now()
) {
  const cache = new Map<string, { until: number; stats: SubstackStats }>();
  const pending = new Map<string, Promise<SubstackStats>>();

  async function readJson(response: Response): Promise<unknown> {
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('application/json')
    ) {
      throw new Error('Public counts unavailable');
    }
    if (
      Number(response.headers.get('content-length')) > LIMIT ||
      !response.body
    ) {
      throw new Error('Invalid public response');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '',
      size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > LIMIT) throw new Error('Public response too large');
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return JSON.parse(text);
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  async function stats(url: string): Promise<SubstackStats> {
    const slug = publicPostSlug(url);
    if (!slug) return emptySubstackStats();
    const cached = cache.get(slug);
    if (cached && cached.until > now()) return cached.stats;
    const active = pending.get(slug);
    if (active) return active;
    const result = (async () => {
      let value: SubstackStats;
      let ttl = HOUR;
      try {
        const response = await request(
          `${SUBSTACK_ORIGIN}/api/v1/posts/${slug}`,
          {
            headers: { Accept: 'application/json' },
            redirect: 'error',
            credentials: 'omit',
            signal: AbortSignal.timeout(8000),
          }
        );
        value = parseSubstackStats(
          await readJson(response),
          slug,
          new Date(now()).toISOString()
        );
      } catch {
        ttl = RETRY;
        value =
          cached?.stats.checkedAt &&
          now() - Date.parse(cached.stats.checkedAt) < DAY
            ? { ...cached.stats, status: 'stale' }
            : emptySubstackStats();
      }
      // Bound warm-instance memory even if the publication grows substantially.
      if (!cache.has(slug) && cache.size >= 200)
        cache.delete(cache.keys().next().value!);
      cache.set(slug, { until: now() + ttl, stats: value });
      return value;
    })().finally(() => pending.delete(slug));
    pending.set(slug, result);
    return result;
  }
  return { stats };
}

export const substackStatsService = createSubstackStatsService();
