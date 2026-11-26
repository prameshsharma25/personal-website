import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createSubstackViewsService,
  substackDocumentTitle,
  substackViewsService,
} from '../lib/substack-views-server';
import handler from '../pages/api/substack-views';

const root = 'https://prameshsharma.substack.com';
const a = `${root}/p/a-vision-of-the-future`,
  b = `${root}/p/who-am-i`;
const titleA = 'A Vision of the Future - by Pramesh Sharma | PKD to PhD';
const titleB = 'Running Without Limits - by Pramesh Sharma | PKD to PhD';
const env = {
  SUBSTACK_GA4_ENABLED: 'true',
  SUBSTACK_GA4_PROPERTY_ID: '123',
  SUBSTACK_GA4_STREAM_ID: '456',
  SUBSTACK_GA4_CLIENT_ID: 'test-client',
  SUBSTACK_GA4_CLIENT_SECRET: 'test-secret',
  SUBSTACK_GA4_REFRESH_TOKEN: 'test-refresh',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const page = (title: string, url: string) =>
  `<html><head><title>${title}</title><link href="${url}" rel="canonical" /></head><body>Not needed</body></html>`;
const report = (rows: [string, string][] = []) => ({
  dimensionHeaders: [{ name: 'unifiedScreenName' }],
  metricHeaders: [{ name: 'screenPageViews', type: 'TYPE_INTEGER' }],
  rowCount: rows.length,
  rows: rows.map(([title, count]) => ({
    dimensionValues: [{ value: title }],
    metricValues: [{ value: count }],
  })),
});
function fixture(
  options: {
    report?: unknown;
    stream?: unknown;
    fail?: string;
    duplicate?: boolean;
    invalidPage?: boolean;
  } = {}
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const request: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.credentials, 'omit');
    if (options.fail && url.includes(options.fail))
      return json({ error: 'private upstream detail test-secret' }, 403);
    if (url.includes('oauth2'))
      return json({ access_token: 'test-access', expires_in: 3600 });
    if (url.includes('analyticsadmin'))
      return json(
        options.stream ?? {
          name: 'properties/123/dataStreams/456',
          type: 'WEB_DATA_STREAM',
          webStreamData: { defaultUri: root },
        }
      );
    if (url.startsWith(root)) {
      assert.equal(
        init?.headers,
        undefined,
        'Never send Google authorization to Substack'
      );
      return new Response(
        page(
          url === a || options.duplicate ? titleA : titleB,
          options.invalidPage ? `${root}/p/other` : url
        ),
        { headers: { 'Content-Type': 'text/html' } }
      );
    }
    if (url.includes('analyticsdata'))
      return json(options.report ?? report([[titleA, '7']]));
    throw new Error('Unexpected request');
  };
  return { calls, request, options };
}

test('public page title uses exact Substack identity and decodes entities without guessing a title', () => {
  assert.equal(
    substackDocumentTitle(
      page('Words &amp; Ideas &#x2019; &#39; &quot;', a),
      a
    ),
    `Words & Ideas ’ ' "`
  );
  for (const html of [
    page('Title', b),
    page('Title', 'https://other.substack.com/p/a-vision-of-the-future'),
    '<head><title>Not Found</title></head>',
    page('', a),
    page('&unsupported;', a),
  ])
    assert.throws(() => substackDocumentTitle(html, a));
});

test('disabled and incomplete credentials make no outbound calls and never imply zero', async () => {
  const { calls, request } = fixture();
  assert.equal(
    (await createSubstackViewsService({}, request).stats(a, [a])).status,
    'disabled'
  );
  for (const overrides of [
    { SUBSTACK_GA4_CLIENT_SECRET: '' },
    { SUBSTACK_GA4_PROPERTY_ID: 'G-NOT-A-PROPERTY' },
    { SUBSTACK_GA4_STREAM_ID: '../456' },
  ]) {
    const data = await createSubstackViewsService(
      { ...env, ...overrides },
      request
    ).stats(a, [a]);
    assert.equal(data.status, 'unavailable');
    assert.equal(data.views, null);
  }
  assert.equal(calls.length, 0);
});

test('queries web page views by exact titles in the verified stream; only aggregate counts are published', async () => {
  const { calls, request } = fixture();
  const service = createSubstackViewsService(env, request);
  const stats = await service.stats(a, [a, b]);
  assert.equal(stats.views, 7);
  assert.equal(stats.windowMinutes, 30);
  assert.equal(
    (await service.stats(b, [a, b])).views,
    0,
    'A validated empty title window is zero'
  );
  const body = JSON.parse(
    String(calls.find((call) => call.url.includes('analyticsdata'))!.init!.body)
  );
  assert.deepEqual(body.dimensions, [{ name: 'unifiedScreenName' }]);
  assert.deepEqual(body.metrics, [{ name: 'screenPageViews' }]);
  assert.equal(
    body.dimensionFilter.andGroup.expressions[0].filter.stringFilter.value,
    '456'
  );
  assert.equal(
    body.dimensionFilter.andGroup.expressions[1].filter.stringFilter.value,
    'web'
  );
  assert.deepEqual(
    body.dimensionFilter.andGroup.expressions[2].filter.inListFilter,
    { values: [titleA, titleB], caseSensitive: true }
  );
  assert.doesNotMatch(
    JSON.stringify(body),
    /pagePath|pageLocation|activeUsers/
  );
  assert.deepEqual(Object.keys(stats).sort(), [
    'checkedAt',
    'status',
    'views',
    'windowMinutes',
  ]);
  assert.doesNotMatch(
    JSON.stringify(stats),
    /test-access|test-secret|test-refresh|properties|PKD/
  );
});

test('deduplicates concurrent reports across posts and refreshes counts without repeating cached titles or token', async () => {
  let now = Date.parse('2026-11-26T12:00:00Z');
  const { calls, request } = fixture();
  const service = createSubstackViewsService(env, request, () => now);
  await Promise.all([
    service.stats(a, [a, b]),
    service.stats(b, [b, a]),
    service.stats(a, [a, b]),
  ]);
  assert.equal(calls.filter((c) => c.url.includes('analyticsdata')).length, 1);
  now += 61_000;
  await service.stats(a, [a, b]);
  assert.equal(calls.filter((c) => c.url.includes('analyticsdata')).length, 2);
  assert.equal(calls.filter((c) => c.url.startsWith(root)).length, 2);
  assert.equal(calls.filter((c) => c.url.includes('oauth2')).length, 1);
});

test('wrong stream, revoked token, and report failures stay unavailable without leaking upstream details', async () => {
  for (const options of [
    {
      stream: {
        name: 'properties/123/dataStreams/456',
        type: 'WEB_DATA_STREAM',
        webStreamData: { defaultUri: 'https://prameshsharma.com' },
      },
    },
    {
      stream: {
        name: 'properties/999/dataStreams/456',
        type: 'WEB_DATA_STREAM',
        webStreamData: { defaultUri: root },
      },
    },
    { fail: 'oauth2' },
    { fail: 'analyticsdata' },
  ]) {
    const f = fixture(options);
    const stats = await createSubstackViewsService(env, f.request).stats(a, [
      a,
    ]);
    assert.equal(stats.status, 'unavailable');
    assert.equal(stats.views, null);
    assert.equal(stats.checkedAt, null);
    assert.doesNotMatch(JSON.stringify(stats), /private|test-secret/);
    if (options.stream || options.fail === 'oauth2')
      assert.equal(
        f.calls.some((c) => c.url.includes('analyticsdata')),
        false
      );
  }
});

test('truncated, malformed, duplicate, suppressed, or unexpected rows never create plausible counts', async () => {
  for (const data of [
    {},
    { ...report(), rowCount: 1 },
    { ...report(), rows: 'invalid' },
    report([[titleA, '-1']]),
    report([[titleA, '1.5']]),
    report([[titleA, '9007199254740992']]),
    report([
      [titleA, '2'],
      [titleA, '3'],
    ]),
    report([['Another Article', '10']]),
    { ...report(), metadata: { subjectToThresholding: true } },
    { ...report(), metricHeaders: [{ name: 'activeUsers' }] },
  ]) {
    const f = fixture({ report: data });
    const stats = await createSubstackViewsService(env, f.request).stats(a, [
      a,
    ]);
    assert.equal(stats.status, 'unavailable', JSON.stringify(data));
    assert.equal(stats.views, null);
  }
  const f = fixture({
    report: {
      dimensionHeaders: [{ name: 'unifiedScreenName' }],
      metricHeaders: [{ name: 'screenPageViews' }],
    },
  });
  assert.equal(
    (await createSubstackViewsService(env, f.request).stats(a, [a])).views,
    0
  );
});

test('duplicate titles and unavailable page identities are not assigned counts', async () => {
  for (const options of [{ duplicate: true }, { invalidPage: true }]) {
    const f = fixture(options);
    const service = createSubstackViewsService(env, f.request);
    assert.equal((await service.stats(a, [a, b])).status, 'unavailable');
    assert.equal((await service.stats(b, [a, b])).views, null);
    assert.equal(
      f.calls.some((c) => c.url.includes('analyticsdata')),
      false
    );
  }
});

test('a failed refresh removes old window counts and successful retry recovers', async () => {
  let now = Date.parse('2026-11-26T12:00:00Z');
  const f = fixture();
  const service = createSubstackViewsService(env, f.request, () => now);
  assert.equal((await service.stats(a, [a])).views, 7);
  f.options.fail = 'analyticsdata';
  now += 61_000;
  assert.equal((await service.stats(a, [a])).views, null);
  const calls = f.calls.length;
  await service.stats(a, [a]);
  assert.equal(
    f.calls.length,
    calls,
    'Cache failures briefly to avoid retry storms'
  );
  delete f.options.fail;
  now += 61_000;
  assert.equal((await service.stats(a, [a])).views, 7);
});

test('noncatalog URLs and unsupported publication hosts never trigger network access', async () => {
  const f = fixture();
  const service = createSubstackViewsService(env, f.request);
  for (const [url, catalog] of [
    [a, [b]],
    [
      'https://other.substack.com/p/private',
      ['https://other.substack.com/p/private'],
    ],
    [a, [a + '?private=1']],
  ] as [string, string[]][])
    assert.equal((await service.stats(url, catalog)).views, null);
  assert.equal(f.calls.length, 0);
});

test('API allowlists published posts and bounds CDN freshness by original measurement time', async () => {
  const original = substackViewsService.stats;
  let calls = 0;
  substackViewsService.stats = async (url, catalog) => {
    calls++;
    assert.equal(url, a);
    assert.ok(catalog.includes(b));
    return {
      status: 'available',
      checkedAt: new Date(Date.now() - 30_000).toISOString(),
      views: 7,
      windowMinutes: 30,
    };
  };
  async function invoke(method: string, slug: unknown) {
    const result = {
      code: 0,
      headers: {} as Record<string, string>,
      body: null as unknown,
    };
    const res = {
      setHeader(name: string, value: string) {
        result.headers[name] = value;
      },
      status(code: number) {
        result.code = code;
        return this;
      },
      json(body: unknown) {
        result.body = body;
        return this;
      },
    };
    await handler(
      { method, query: { slug } } as NextApiRequest,
      res as unknown as NextApiResponse
    );
    return result;
  }
  try {
    for (const slug of ['../private', ['a'], 'https://example.com', undefined])
      assert.equal((await invoke('GET', slug)).code, 400);
    assert.equal((await invoke('POST', 'a-vision-of-the-future')).code, 405);
    assert.equal((await invoke('GET', 'missing')).code, 404);
    assert.equal(
      (await invoke('GET', 'how-i-found-an-nih-postbac-lab')).code,
      404
    );
    assert.equal(calls, 0);
    const response = await invoke('GET', 'a-vision-of-the-future');
    assert.equal(response.code, 200);
    assert.match(
      response.headers['Cache-Control'],
      /^public, s-maxage=(29|30)$/
    );
  } finally {
    substackViewsService.stats = original;
  }
});
