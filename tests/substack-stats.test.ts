import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextApiRequest, NextApiResponse } from 'next';
import { publicPostSlug, parseSubstackStats } from '../lib/substack-stats';
import {
  createSubstackStatsService,
  substackStatsService,
} from '../lib/substack-stats-server';
import handler from '../pages/api/substack-stats';

const slug = 'a-vision-of-the-future';
const url = `https://prameshsharma.substack.com/p/${slug}`;
const original = {
  slug,
  canonical_url: url,
  reaction_count: 0,
  comment_count: 3,
  restacks: 2,
  body_html: '<p>Not part of the API response</p>',
  reader_email: 'not-public@example.invalid',
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });

test('only configured-publication post URLs and matching response identities are accepted', () => {
  assert.equal(publicPostSlug(url), slug);
  for (const input of [
    'https://example.com/p/' + slug,
    url + '?token=secret',
    url + '#private',
    url.replace('https:', 'http:'),
    url.replace('/p/', '/api/'),
    url.replace('prameshsharma.', 'elsewhere.'),
    'https://name:password@prameshsharma.substack.com/p/a',
  ])
    assert.equal(publicPostSlug(input), null);
  assert.throws(() =>
    parseSubstackStats(
      { ...original, slug: 'wrong' },
      slug,
      new Date().toISOString()
    )
  );
  assert.throws(() =>
    parseSubstackStats(
      {
        ...original,
        canonical_url: 'https://elsewhere.substack.com/p/' + slug,
      },
      slug,
      new Date().toISOString()
    )
  );
});

test('preserves measured zeros, rejects malformed counts, and publishes only aggregate fields', () => {
  const stats = parseSubstackStats(
    { ...original, comment_count: '3', restacks: -1 },
    slug,
    '2026-11-26T12:00:00Z'
  );
  assert.deepEqual(stats, {
    status: 'available',
    checkedAt: '2026-11-26T12:00:00Z',
    likes: 0,
    comments: null,
    restacks: null,
  });
  assert.doesNotMatch(JSON.stringify(stats), /reader_email|body_html/);
  assert.throws(() =>
    parseSubstackStats(
      {
        slug,
        canonical_url: url,
        reaction_count: Infinity,
        comment_count: 1.5,
        restacks: null,
      },
      slug,
      '2026-11-26T12:00:00Z'
    )
  );
});

test('combines concurrent requests, caches success, and expires visibly stale data after a day', async () => {
  let time = Date.parse('2026-11-26T12:00:00Z'),
    calls = 0,
    fail = false;
  const service = createSubstackStatsService(
    async (input, init) => {
      calls++;
      assert.equal(
        String(input),
        `https://prameshsharma.substack.com/api/v1/posts/${slug}`
      );
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.redirect, 'error');
      if (fail) throw new Error('Upstream details must stay private');
      await new Promise((resolve) => setTimeout(resolve, 5));
      return json(original);
    },
    () => time
  );
  const [a, b] = await Promise.all([service.stats(url), service.stats(url)]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  assert.equal(a.likes, 0);
  time += 59 * 60 * 1000;
  await service.stats(url);
  assert.equal(calls, 1);
  time += 2 * 60 * 1000;
  fail = true;
  const stale = await service.stats(url);
  assert.equal(calls, 2);
  assert.equal(stale.status, 'stale');
  assert.equal(stale.checkedAt, a.checkedAt);
  assert.equal(stale.comments, 3);
  await service.stats(url);
  assert.equal(calls, 2);
  time += 24 * 60 * 60 * 1000;
  const empty = await service.stats(url);
  assert.equal(empty.status, 'unavailable');
  assert.equal(empty.likes, null);
  assert.equal(empty.checkedAt, null);
  assert.doesNotMatch(JSON.stringify(empty), /Upstream/);
});

test('rejects HTML, oversized responses, and wrong-post data without manufacturing measurements', async () => {
  for (const response of [
    new Response('<html>Unavailable</html>', {
      headers: { 'Content-Type': 'text/html' },
    }),
    json({ ...original, body_html: 'x'.repeat(2 * 1024 * 1024) }),
    json({ ...original, slug: 'another-post' }),
    new Response('unavailable', { status: 503 }),
  ]) {
    const service = createSubstackStatsService(async () => response);
    const stats = await service.stats(url);
    assert.equal(stats.status, 'unavailable');
    assert.equal(stats.comments, null);
  }
  let calls = 0;
  const service = createSubstackStatsService(async () => {
    calls++;
    return json(original);
  });
  await service.stats('https://example.com/private');
  assert.equal(calls, 0);
});

test('API accepts only published local posts and bounds CDN freshness by the original fetch time', async () => {
  const old = substackStatsService.stats;
  let calls = 0;
  const checkedAt = new Date(Date.now() - 1800 * 1000).toISOString();
  substackStatsService.stats = async () => {
    calls++;
    return parseSubstackStats(original, slug, checkedAt);
  };
  try {
    async function invoke(method: string, query: Record<string, unknown>) {
      const result = {
        code: 0,
        body: null as unknown,
        headers: {} as Record<string, string>,
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
        { method, query } as NextApiRequest,
        res as unknown as NextApiResponse
      );
      return result;
    }
    for (const query of [
      { slug: '../privacy' },
      { slug: [slug] },
      { slug: 'https://example.com' },
    ])
      assert.equal((await invoke('GET', query)).code, 400);
    assert.equal((await invoke('POST', { slug })).code, 405);
    assert.equal((await invoke('GET', { slug: 'missing-post' })).code, 404);
    assert.equal(
      (await invoke('GET', { slug: 'how-i-found-an-nih-postbac-lab' })).code,
      404
    );
    assert.equal(calls, 0);
    const result = await invoke('GET', { slug });
    assert.equal(result.code, 200);
    assert.equal(calls, 1);
    assert.match(
      result.headers['Cache-Control'],
      /^public, s-maxage=17\d\d$|^public, s-maxage=1800$/
    );
    assert.doesNotMatch(JSON.stringify(result.body), /reader_email|body_html/);
  } finally {
    substackStatsService.stats = old;
  }
});
