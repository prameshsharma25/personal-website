// Server only. The durable counter lives in Redis, not a serverless instance.
import { createHash } from 'node:crypto';
import {
  emptyWebsiteViews,
  validViewSession,
  validViewSlug,
  type WebsiteViews,
} from './website-views';

// One atomic operation prevents reloads, retries, and concurrent tabs sharing
// a session ID from double counting. Both keys use the same Redis hash slot.
export const RECORD_VIEW_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current and (not tonumber(current) or tonumber(current) < 0) then
  return redis.error_reply('Invalid counter')
end
if redis.call('EXISTS', KEYS[2]) == 1 then
  return current or '0'
end
local total = redis.pcall('INCR', KEYS[1])
if type(total) == 'table' and total.err then return total end
local saved = redis.pcall('SET', KEYS[2], '1', 'EX', ARGV[1])
if type(saved) == 'table' and saved.err then
  redis.call('DECR', KEYS[1])
  return saved
end
return tostring(total)
`;

export function createWebsiteViewsService(
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch
) {
  function configuration() {
    if (env.WEBSITE_VIEWS_ENABLED !== 'true') return null;
    // Accept either naming convention as a complete pair. Never send one
    // provider pair's token to an endpoint selected from the other pair.
    const explicit = Boolean(
      env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_TOKEN
    );
    const raw = explicit ? env.UPSTASH_REDIS_REST_URL : env.KV_REST_API_URL;
    const token = explicit
      ? env.UPSTASH_REDIS_REST_TOKEN
      : env.KV_REST_API_TOKEN;
    // Local development and preview deployments never share production totals.
    const namespace =
      env.WEBSITE_VIEWS_NAMESPACE || env.VERCEL_ENV || 'development';
    if (!raw || !token || !/^[a-z0-9-]{1,60}$/.test(namespace))
      throw new Error('Missing counter configuration');
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error('Invalid Redis endpoint');
    return { url: url.origin, token, namespace };
  }
  async function count(slug: string, session?: string): Promise<WebsiteViews> {
    if (
      !validViewSlug(slug) ||
      (session !== undefined && !validViewSession(session))
    )
      return emptyWebsiteViews();
    try {
      const config = configuration();
      if (!config) return emptyWebsiteViews('disabled');
      const key = `personal-website:views:v1:{${config.namespace}:${slug}}`;
      const command = session
        ? [
            'EVAL',
            RECORD_VIEW_SCRIPT,
            '2',
            `${key}:total`,
            `${key}:seen:${createHash('sha256').update(session.toLowerCase()).digest('hex')}`,
            String(30 * 24 * 60 * 60),
          ]
        : ['GET', `${key}:total`];
      const response = await request(config.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.timeout(5000),
      });
      if (
        !response.ok ||
        !response.headers.get('content-type')?.includes('application/json') ||
        !response.body ||
        Number(response.headers.get('content-length')) > 4096
      )
        throw new Error('Counter unavailable');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let body = '',
        size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4096) throw new Error('Invalid counter response');
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
        Object.hasOwn(data, 'error') ||
        !Object.hasOwn(data, 'result')
      )
        throw new Error('Counter unavailable');
      const raw = data.result;
      // A missing stored total means tracking has not recorded any visits yet.
      const views =
        raw === null && !session
          ? 0
          : typeof raw === 'number' ||
              (typeof raw === 'string' && /^\d+$/.test(raw))
            ? Number(raw)
            : NaN;
      if (!Number.isSafeInteger(views) || views < 0)
        throw new Error('Invalid counter');
      return { status: 'available', views, recorded: Boolean(session) };
    } catch {
      // Never replace storage outages with a fabricated zero or local-only total.
      return emptyWebsiteViews();
    }
  }
  return {
    read: (slug: string) => count(slug),
    record: (slug: string, session: string) => count(slug, session),
  };
}
export const websiteViewsService = createWebsiteViewsService();
