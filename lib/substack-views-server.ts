// Server only. Credentials and raw Analytics reports never reach the browser.
import { SUBSTACK_ORIGIN, publicPostSlug } from './substack-stats';
import { emptySubstackViews, type SubstackViews } from './substack-views';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const MAX_POSTS = 200;
type Environment = Record<string, string | undefined>;
type Snapshot = { until: number; values: Map<string, SubstackViews> };

function decodeHtml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (_, entity: string) => {
    const named: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: '\u00a0',
    };
    if (Object.hasOwn(named, entity)) return named[entity];
    const code = entity.startsWith('#x')
      ? parseInt(entity.slice(2), 16)
      : entity.startsWith('#')
        ? Number(entity.slice(1))
        : NaN;
    if (
      !Number.isInteger(code) ||
      code <= 0 ||
      code > 0x10ffff ||
      (code >= 0xd800 && code <= 0xdfff)
    )
      throw new Error('Unsupported title encoding');
    return String.fromCodePoint(code);
  });
}

// Read the actual document title, not the possibly different local article title.
export function substackDocumentTitle(html: string, url: string): string {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1];
  if (!head) throw new Error('Missing page head');
  const title = head.match(/<title\b[^>]*>([^<]*)<\/title\s*>/i)?.[1];
  let canonical: string | undefined;
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const attr of tag.matchAll(/\b(rel|href)\s*=\s*(["'])(.*?)\2/gi))
      attrs[attr[1].toLowerCase()] = decodeHtml(attr[3]);
    if (attrs.rel?.toLowerCase() === 'canonical') canonical = attrs.href;
  }
  if (
    !title ||
    !canonical ||
    !publicPostSlug(canonical) ||
    publicPostSlug(canonical) !== publicPostSlug(url)
  )
    throw new Error('Article identity unavailable');
  const decoded = decodeHtml(title).trim();
  if (!decoded || decoded.length > 500) throw new Error('Invalid page title');
  return decoded;
}

async function boundedText(response: Response, type: string, limit: number) {
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes(type) ||
    !response.body ||
    Number(response.headers.get('content-length')) > limit
  )
    throw new Error('Response unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '',
    size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Response too large');
      text += decoder.decode(value, { stream: true });
      // Only the head is needed. Do not download the article body unnecessarily.
      if (type === 'text/html' && /<\/head\s*>/i.test(text)) return text;
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createSubstackViewsService(
  env: Environment = process.env,
  request: typeof fetch = fetch,
  now = () => Date.now()
) {
  let token: { value: string; until: number } | null = null;
  let snapshot: Snapshot | null = null;
  let pending: Promise<Snapshot> | null = null;
  let catalogKey = '';
  const titles = new Map<string, { title: string | null; until: number }>();
  const configured = () =>
    env.SUBSTACK_GA4_ENABLED === 'true' &&
    /^\d{1,20}$/.test(env.SUBSTACK_GA4_PROPERTY_ID ?? '') &&
    /^\d{1,20}$/.test(env.SUBSTACK_GA4_STREAM_ID ?? '') &&
    Boolean(
      env.SUBSTACK_GA4_CLIENT_ID &&
      env.SUBSTACK_GA4_CLIENT_SECRET &&
      env.SUBSTACK_GA4_REFRESH_TOKEN
    );

  async function json(url: string, init: RequestInit = {}) {
    const response = await request(url, {
      ...init,
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.any([
        AbortSignal.timeout(8000),
        ...(init.signal ? [init.signal] : []),
      ]),
    });
    return JSON.parse(
      await boundedText(response, 'application/json', 512 * 1024)
    );
  }
  async function accessToken(signal: AbortSignal) {
    if (token && token.until > now()) return token.value;
    const data = await json('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.SUBSTACK_GA4_CLIENT_ID!,
        client_secret: env.SUBSTACK_GA4_CLIENT_SECRET!,
        refresh_token: env.SUBSTACK_GA4_REFRESH_TOKEN!,
        grant_type: 'refresh_token',
      }),
    });
    if (
      typeof data.access_token !== 'string' ||
      !data.access_token ||
      typeof data.expires_in !== 'number' ||
      data.expires_in <= 0
    )
      throw new Error('Authorization unavailable');
    token = {
      value: data.access_token,
      until: now() + Math.max(0, Math.min(data.expires_in, 3600) - 60) * 1000,
    };
    return token.value;
  }
  async function pageTitle(url: string, signal: AbortSignal) {
    const cached = titles.get(url);
    if (cached && cached.until > now()) return cached.title;
    let title: string | null = null;
    try {
      const response = await request(url, {
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.any([AbortSignal.timeout(8000), signal]),
      });
      title = substackDocumentTitle(
        await boundedText(response, 'text/html', 2 * 1024 * 1024),
        url
      );
    } catch {
      /* No title means no measurement, never a fabricated zero. */
    }
    titles.set(url, { title, until: now() + (title ? HOUR : MINUTE) });
    return title;
  }

  async function refresh(urls: string[]): Promise<Snapshot> {
    const values = new Map(urls.map((url) => [url, emptySubstackViews()]));
    const deadline = AbortSignal.timeout(20_000);
    let checkedAt: string;
    try {
      const headers = {
        Authorization: `Bearer ${await accessToken(deadline)}`,
      };
      const resource = `properties/${env.SUBSTACK_GA4_PROPERTY_ID}/dataStreams/${env.SUBSTACK_GA4_STREAM_ID}`;
      const stream = await json(
        `https://analyticsadmin.googleapis.com/v1beta/${resource}`,
        { headers, signal: deadline }
      );
      let origin = '';
      try {
        origin = new URL(stream.webStreamData?.defaultUri).origin;
      } catch {}
      if (
        stream.name !== resource ||
        stream.type !== 'WEB_DATA_STREAM' ||
        origin !== SUBSTACK_ORIGIN
      )
        throw new Error('Stream does not match the publication');

      // Limit simultaneous public page requests and refuse duplicate titles.
      const matched = new Map<string, string[]>();
      for (let i = 0; i < urls.length; i += 4) {
        deadline.throwIfAborted();
        await Promise.all(
          urls.slice(i, i + 4).map(async (url) => {
            const title = await pageTitle(url, deadline);
            if (title) matched.set(title, [...(matched.get(title) ?? []), url]);
          })
        );
      }
      const uniqueTitles = [...matched]
        .filter(([, urls]) => urls.length === 1)
        .map(([title]) => title);
      if (!uniqueTitles.length) throw new Error('Article titles unavailable');
      checkedAt = new Date(now()).toISOString();
      const data = await json(
        `https://analyticsdata.googleapis.com/v1beta/properties/${env.SUBSTACK_GA4_PROPERTY_ID}:runRealtimeReport`,
        {
          method: 'POST',
          signal: deadline,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dimensions: [{ name: 'unifiedScreenName' }],
            metrics: [{ name: 'screenPageViews' }],
            dimensionFilter: {
              andGroup: {
                expressions: [
                  {
                    filter: {
                      fieldName: 'streamId',
                      stringFilter: {
                        matchType: 'EXACT',
                        value: env.SUBSTACK_GA4_STREAM_ID,
                      },
                    },
                  },
                  {
                    filter: {
                      fieldName: 'platform',
                      stringFilter: { matchType: 'EXACT', value: 'web' },
                    },
                  },
                  {
                    filter: {
                      fieldName: 'unifiedScreenName',
                      inListFilter: {
                        values: uniqueTitles,
                        caseSensitive: true,
                      },
                    },
                  },
                ],
              },
            },
            // The documented default is one rolling 30 minute window, including now.
            limit: String(MAX_POSTS),
          }),
        }
      );
      if (
        data.dimensionHeaders?.length !== 1 ||
        data.dimensionHeaders[0]?.name !== 'unifiedScreenName' ||
        data.metricHeaders?.length !== 1 ||
        data.metricHeaders[0]?.name !== 'screenPageViews' ||
        data.metadata?.subjectToThresholding ||
        data.metadata?.dataLossFromOtherRow
      )
        throw new Error('Incomplete report');
      const rows = data.rows ?? [];
      if (
        !Array.isArray(rows) ||
        rows.length > MAX_POSTS ||
        (data.rowCount !== undefined &&
          (!Number.isSafeInteger(data.rowCount) ||
            data.rowCount !== rows.length))
      )
        throw new Error('Truncated report');
      const counts = new Map<string, number>();
      for (const row of rows) {
        const title = row.dimensionValues?.[0]?.value;
        const raw = row.metricValues?.[0]?.value;
        if (
          !uniqueTitles.includes(title) ||
          counts.has(title) ||
          row.dimensionValues?.length !== 1 ||
          row.metricValues?.length !== 1 ||
          typeof raw !== 'string' ||
          !/^\d+$/.test(raw) ||
          !Number.isSafeInteger(Number(raw))
        )
          throw new Error('Invalid report row');
        counts.set(title, Number(raw));
      }
      for (const title of uniqueTitles) {
        values.set(matched.get(title)![0], {
          status: 'available',
          views: counts.get(title) ?? 0,
          checkedAt,
          windowMinutes: 30,
        });
      }
    } catch {
      // A failed refresh removes old numbers. A previous 30 minute window is not live.
      token = null;
    }
    return { until: now() + MINUTE, values };
  }

  async function stats(url: string, catalog: string[]): Promise<SubstackViews> {
    if (env.SUBSTACK_GA4_ENABLED !== 'true')
      return emptySubstackViews('disabled');
    if (!configured()) return emptySubstackViews();
    const urls = [...new Set(catalog)]
      .filter((value) => publicPostSlug(value))
      .sort();
    if (!urls.includes(url) || urls.length > MAX_POSTS)
      return emptySubstackViews();
    const key = JSON.stringify(urls);
    if (catalogKey !== key) {
      // Production catalogs are immutable per deployment. Avoid cross-catalog data.
      if (pending) await pending;
      catalogKey = key;
      snapshot = null;
      titles.clear();
    }
    if (!snapshot || snapshot.until <= now()) {
      if (!pending)
        pending = refresh(urls).finally(() => {
          pending = null;
        });
      snapshot = await pending;
    }
    return snapshot.values.get(url) ?? emptySubstackViews();
  }
  return { stats };
}

export const substackViewsService = createSubstackViewsService();
