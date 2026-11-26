// Server only. Browser components import types and constants from youtube.ts.
import {
  YOUTUBE_CHANNEL_ID,
  YOUTUBE_FALLBACK,
  parseYouTubeFeed,
  analyticsWindow,
  type YouTubeFeed,
  type YouTubeAnalytics,
} from './youtube';

export function createYouTubeService(
  request: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
  now = () => Date.now()
) {
  let feedCache: YouTubeFeed | null = null,
    feedUntil = 0;
  let feedPending: Promise<YouTubeFeed> | null = null;
  let token: { value: string; until: number } | null = null;
  let tokenPending: Promise<string> | null = null;
  const reports = new Map<
    string,
    { until: number; value: Promise<YouTubeAnalytics> }
  >();
  async function json(url: string, init?: RequestInit) {
    const response = await request(url, {
      ...init,
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('YouTube request failed');
    return response.json();
  }
  async function feed(): Promise<YouTubeFeed> {
    if (feedCache && now() < feedUntil) return feedCache;
    if (feedPending) return feedPending;
    feedPending = (async () => {
      try {
        const response = await request(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!response.ok) throw new Error('Feed unavailable');
        feedCache = {
          videos: parseYouTubeFeed(await response.text()),
          checkedAt: new Date(now()).toISOString(),
          status: 'fresh',
        };
        feedUntil = now() + 15 * 60 * 1000;
      } catch {
        // Retain a bounded, visibly dated sample during brief upstream failures.
        feedCache =
          feedCache?.checkedAt &&
          now() - Date.parse(feedCache.checkedAt) < 24 * 60 * 60 * 1000
            ? { ...feedCache, status: 'stale' }
            : YOUTUBE_FALLBACK;
        feedUntil = now() + 60000;
      }
      return feedCache;
    })().finally(() => {
      feedPending = null;
    });
    return feedPending;
  }
  async function accessToken() {
    if (token && now() < token.until) return token.value;
    if (tokenPending) return tokenPending;
    tokenPending = (async () => {
      const auth = await json('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: env.YOUTUBE_CLIENT_ID!,
          client_secret: env.YOUTUBE_CLIENT_SECRET!,
          refresh_token: env.YOUTUBE_REFRESH_TOKEN!,
        }),
      });
      if (typeof auth.access_token !== 'string' || !(auth.expires_in > 60))
        throw new Error('Authorization unavailable');
      // Never publish reports from a different account or Brand Account.
      const channels = await json(
        'https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',
        {
          headers: { Authorization: `Bearer ${auth.access_token}` },
        }
      );
      if (
        !channels.items?.some(
          (channel: { id: string }) => channel.id === YOUTUBE_CHANNEL_ID
        )
      )
        throw new Error('Wrong channel');
      token = {
        value: auth.access_token,
        until: now() + (Math.min(auth.expires_in, 3600) - 60) * 1000,
      };
      return token.value;
    })().finally(() => {
      tokenPending = null;
    });
    return tokenPending;
  }
  async function analytics(
    videoId: string,
    days: 28 | 90
  ): Promise<YouTubeAnalytics> {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || ![28, 90].includes(days))
      throw new Error('Invalid report selection');
    const window = analyticsWindow(days, new Date(now()));
    const empty: YouTubeAnalytics = {
      ...window,
      videoId,
      status: 'not_connected',
      checkedAt: null,
      daily: null,
      summary: null,
      searchTerms: null,
    };
    if (
      env.YOUTUBE_PUBLIC_ANALYTICS_ENABLED !== 'true' ||
      !env.YOUTUBE_CLIENT_ID ||
      !env.YOUTUBE_CLIENT_SECRET ||
      !env.YOUTUBE_REFRESH_TOKEN
    )
      return empty;
    const key = `${videoId}:${days}:${window.endDate}`;
    const cached = reports.get(key);
    if (cached && now() < cached.until) return cached.value;
    // At most 15 videos and two windows; discard expired entries before new work.
    for (const [k, v] of reports) if (now() >= v.until) reports.delete(k);
    const value = (async () => {
      try {
        const access = await accessToken();
        const query = async (params: Record<string, string>) =>
          json(
            'https://youtubeanalytics.googleapis.com/v2/reports?' +
              new URLSearchParams({
                ids: `channel==${YOUTUBE_CHANNEL_ID}`,
                ...window,
                filters: `video==${videoId}`,
                ...params,
              }),
            { headers: { Authorization: `Bearer ${access}` } }
          );
        const results = await Promise.allSettled([
          query({ dimensions: 'day', metrics: 'views', sort: 'day' }),
          query({
            metrics: 'views,estimatedMinutesWatched,averageViewDuration',
          }),
          query({
            dimensions: 'insightTrafficSourceDetail',
            metrics: 'views',
            filters: `video==${videoId};insightTrafficSourceType==YT_SEARCH`,
            sort: '-views',
            maxResults: '25',
          }),
        ]);
        function rows(index: number, names: string[]) {
          const report = results[index];
          if (report.status !== 'fulfilled') return null;
          const headers = report.value.columnHeaders?.map(
            (h: { name: string }) => h.name
          );
          if (
            !Array.isArray(headers) ||
            names.some((n) => !headers.includes(n))
          )
            return null;
          if (!Array.isArray(report.value.rows ?? [])) return null;
          return (report.value.rows ?? []).map((row: unknown[]) =>
            names.map((name) => row[headers.indexOf(name)])
          );
        }
        const daily = rows(0, ['day', 'views']);
        const summary = rows(1, [
          'views',
          'estimatedMinutesWatched',
          'averageViewDuration',
        ]);
        const search = rows(2, ['insightTrafficSourceDetail', 'views']);
        const finite = (n: unknown) =>
          typeof n === 'number' && Number.isFinite(n) && n >= 0;
        return {
          ...empty,
          status: daily || summary || search ? 'available' : 'unavailable',
          checkedAt: new Date(now()).toISOString(),
          daily:
            daily
              ?.filter(
                ([date, views]) =>
                  typeof date === 'string' &&
                  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
                  date >= window.startDate &&
                  date <= window.endDate &&
                  finite(views)
              )
              .map(([date, views]) => ({ date, views })) ?? null,
          summary:
            summary?.length && summary[0].every(finite)
              ? {
                  views: summary[0][0],
                  minutesWatched: summary[0][1],
                  averageSeconds: summary[0][2],
                }
              : null,
          searchTerms:
            search
              ?.filter(
                ([term, views]) => typeof term === 'string' && finite(views)
              )
              .map(([term, views]) => ({ term: term.slice(0, 300), views })) ??
            null,
        } as YouTubeAnalytics;
      } catch {
        token = null;
        return { ...empty, status: 'unavailable' } as YouTubeAnalytics;
      }
    })();
    reports.set(key, { until: now() + 15 * 60 * 1000, value });
    return value;
  }
  return { feed, analytics };
}
export const youtubeService = createYouTubeService();
