import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import handler from '../pages/api/youtube';
import {
  analyticsWindow,
  parseYouTubeFeed,
  YOUTUBE_CHANNEL_ID,
  YOUTUBE_FALLBACK,
} from '../lib/youtube';
import { createYouTubeService } from '../lib/youtube-server';

const feed = readFileSync(
  new URL('./fixtures/youtube-feed.xml', import.meta.url),
  'utf8'
);
const env = {
  YOUTUBE_PUBLIC_ANALYTICS_ENABLED: 'true',
  YOUTUBE_CLIENT_ID: 'private-client',
  YOUTUBE_CLIENT_SECRET: 'private-secret',
  YOUTUBE_REFRESH_TOKEN: 'private-refresh',
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const table = (names: string[], rows: unknown[][]) => ({
  columnHeaders: names.map((name) => ({ name })),
  rows,
});

test('public feed preserves real zero counts, decodes titles, and rejects foreign channels and entities', () => {
  const actual = parseYouTubeFeed(feed);
  assert.equal(actual[0].id, 'oDGqUMBvrpY');
  assert.equal(actual[0].views, 216);
  assert.equal(
    parseYouTubeFeed(feed.replace('views="216"', 'views="0"'))[0].views,
    0
  );
  assert.equal(
    parseYouTubeFeed(feed.replace('views="216"', ''))[0].views,
    null
  );
  assert.match(
    parseYouTubeFeed(
      feed.replace(
        '<title>Day in the life',
        '<title>Research &amp; code &#x1F9EC; in the life'
      )
    )[0].title,
    /Research & code 🧬/
  );
  assert.throws(() =>
    parseYouTubeFeed(feed.replaceAll(YOUTUBE_CHANNEL_ID, 'UCwrongChannel'))
  );
  assert.throws(() =>
    parseYouTubeFeed('<!DOCTYPE feed SYSTEM "file:///etc/passwd">' + feed)
  );
  assert.throws(() => parseYouTubeFeed('<html>Service unavailable</html>'));
});
test('report windows use completed Pacific days across UTC and daylight-saving boundaries', () => {
  assert.deepEqual(analyticsWindow(28, new Date('2026-11-26T01:00:00Z')), {
    startDate: '2026-10-28',
    endDate: '2026-11-24',
  });
  assert.deepEqual(analyticsWindow(28, new Date('2026-03-09T06:00:00Z')), {
    startDate: '2026-02-08',
    endDate: '2026-03-07',
  });
});
test('feed requests coalesce, refresh, label stale data, and expire old counts', async () => {
  let calls = 0,
    now = 0,
    fail = false;
  const service = createYouTubeService(
    async () => {
      calls++;
      return new Response(fail ? 'unavailable' : feed, {
        status: fail ? 503 : 200,
      });
    },
    {},
    () => now
  );
  const [a, b] = await Promise.all([service.feed(), service.feed()]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  now = 901000;
  fail = true;
  const stale = await service.feed();
  assert.equal(stale.status, 'stale');
  assert.equal(stale.checkedAt, a.checkedAt);
  now = 25 * 3600000;
  const missing = await service.feed();
  assert.deepEqual(missing, YOUTUBE_FALLBACK);
  assert.equal(missing.videos[0].views, null);
});
test('disconnected analytics do not request credentials or create fake data', async () => {
  const service = createYouTubeService(async () => {
    throw new Error('Must not fetch');
  }, {});
  const value = await service.analytics('oDGqUMBvrpY', 28);
  assert.equal(value.status, 'not_connected');
  assert.equal(value.daily, null);
  assert.equal(value.summary, null);
});
test('authenticated reports verify channel ownership, map columns, preserve partial results, and share cached work', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const service = createYouTubeService(
    async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('/token'))
        return response({ access_token: 'private-access', expires_in: 3600 });
      if (url.includes('/channels?'))
        return response({ items: [{ id: YOUTUBE_CHANNEL_ID }] });
      const params = new URL(url).searchParams;
      assert.equal(params.get('ids'), `channel==${YOUTUBE_CHANNEL_ID}`);
      assert.match(params.get('filters')!, /video==oDGqUMBvrpY/);
      if (params.get('dimensions') === 'day')
        return response(
          table(
            ['views', 'day'],
            [
              [5, '2026-11-20'],
              [0, '2026-11-21'],
            ]
          )
        );
      if (params.get('dimensions') === 'insightTrafficSourceDetail')
        return response({ error: 'private upstream detail' }, 403);
      return response(
        table(
          ['views', 'estimatedMinutesWatched', 'averageViewDuration'],
          [[5, 10, 120]]
        )
      );
    },
    env,
    () => Date.parse('2026-11-25T20:00:00Z')
  );
  const [a, b] = await Promise.all([
    service.analytics('oDGqUMBvrpY', 28),
    service.analytics('oDGqUMBvrpY', 28),
  ]);
  assert.deepEqual(a, b);
  assert.equal(calls.length, 5);
  assert.equal(a.status, 'available');
  assert.deepEqual(a.daily, [
    { date: '2026-11-20', views: 5 },
    { date: '2026-11-21', views: 0 },
  ]);
  assert.deepEqual(a.summary, {
    views: 5,
    minutesWatched: 10,
    averageSeconds: 120,
  });
  assert.equal(a.searchTerms, null);
  assert.doesNotMatch(JSON.stringify(a), /private/);
});
test('wrong-channel credentials cannot publish owner reports', async () => {
  let calls = 0;
  const service = createYouTubeService(async (input) => {
    calls++;
    if (String(input).includes('/token'))
      return response({ access_token: 'private-access', expires_in: 3600 });
    return response({ items: [{ id: 'UCwrong' }] });
  }, env);
  const report = await service.analytics('oDGqUMBvrpY', 28);
  assert.equal(calls, 2);
  assert.equal(report.status, 'unavailable');
  assert.equal(report.daily, null);
});
test('API rejects unsupported methods and unbounded report parameters before upstream work', async () => {
  for (const query of [
    { video: 'https://example.com' },
    { video: ['oDGqUMBvrpY'] },
    { video: 'oDGqUMBvrpY', days: '3650' },
  ]) {
    let code = 0;
    const res = {
      setHeader() {},
      status(n: number) {
        code = n;
        return this;
      },
      json() {},
      end() {},
    };
    await handler({ method: 'GET', query } as any, res as any);
    assert.equal(code, 400);
  }
  let code = 0;
  const res = {
    setHeader() {},
    status(n: number) {
      code = n;
      return this;
    },
    json() {},
    end() {},
  };
  await handler({ method: 'POST', query: {} } as any, res as any);
  assert.equal(code, 405);
});
