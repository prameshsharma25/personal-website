import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createWebsiteViewsService,
  websiteViewsService,
  RECORD_VIEW_SCRIPT,
} from '../lib/website-views-server';
import {
  websiteViewSession,
  rememberWebsiteView,
} from '../lib/website-view-session';
import handler from '../pages/api/website-views';

const slug = 'a-vision-of-the-future';
const env = {
  WEBSITE_VIEWS_ENABLED: 'true',
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-secret',
  VERCEL_ENV: 'production',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('disabled or incomplete configuration never invents counts or makes network requests', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return json({ result: '99' });
  };
  assert.equal(
    (await createWebsiteViewsService({}, fetcher).read(slug)).status,
    'disabled'
  );
  for (const overrides of [
    { UPSTASH_REDIS_REST_TOKEN: '' },
    { UPSTASH_REDIS_REST_URL: 'http://example.upstash.io' },
    { UPSTASH_REDIS_REST_URL: 'https://user:secret@example.upstash.io' },
    { UPSTASH_REDIS_REST_URL: 'https://example.upstash.io/?token=bad' },
    { WEBSITE_VIEWS_NAMESPACE: '../production' },
  ]) {
    const data = await createWebsiteViewsService(
      { ...env, ...overrides },
      fetcher
    ).read(slug);
    assert.equal(data.status, 'unavailable');
    assert.equal(data.views, null);
  }
  assert.equal(calls, 0);
});

test('Vercel KV credentials support reads and writes without mixing credential pairs', async () => {
  const kv = {
    WEBSITE_VIEWS_ENABLED: 'true',
    KV_REST_API_URL: 'https://vercel-example.upstash.io',
    KV_REST_API_TOKEN: 'kv-write-token',
    KV_REST_API_READ_ONLY_TOKEN: 'unused-read-only-token',
  };
  const calls: { url: unknown; auth: string; command: string }[] = [];
  const request: typeof fetch = async (url, init) => {
    calls.push({
      url,
      auth: (init?.headers as Record<string, string>).Authorization,
      command: JSON.parse(String(init?.body))[0],
    });
    return json({ result: '1' });
  };
  const service = createWebsiteViewsService(kv, request);
  assert.equal((await service.read(slug)).status, 'available');
  assert.equal((await service.record(slug, randomUUID())).recorded, true);
  assert.deepEqual(
    calls.map((call) => call.command),
    ['GET', 'EVAL']
  );
  assert.ok(
    calls.every(
      (call) =>
        call.url === kv.KV_REST_API_URL && call.auth === 'Bearer kv-write-token'
    )
  );
  await createWebsiteViewsService({ ...kv, ...env }, request).read(slug);
  assert.equal(calls[2].url, env.UPSTASH_REDIS_REST_URL);
  assert.equal(calls[2].auth, 'Bearer test-secret');
  for (const partial of [
    { ...kv, UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL },
    { ...kv, UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN },
    { ...kv, KV_REST_API_TOKEN: '' },
  ])
    assert.equal(
      (await createWebsiteViewsService(partial, request).read(slug)).status,
      'unavailable'
    );
  assert.equal(calls.length, 3);
  assert.equal(
    (
      await createWebsiteViewsService(
        { ...kv, UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' },
        request
      ).read(slug)
    ).status,
    'available'
  );
});

test('reads use GET commands and preserve a real zero, without recording or leaking credentials', async () => {
  let command: unknown;
  const service = createWebsiteViewsService(env, async (url, init) => {
    assert.equal(url, env.UPSTASH_REDIS_REST_URL);
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.credentials, 'omit');
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      'Bearer test-secret'
    );
    command = JSON.parse(String(init?.body));
    return json({ result: null });
  });
  const data = await service.read(slug);
  assert.deepEqual(command, [
    'GET',
    `personal-website:views:v1:{production:${slug}}:total`,
  ]);
  assert.deepEqual(data, { status: 'available', views: 0, recorded: false });
  assert.doesNotMatch(JSON.stringify(data), /test-secret|upstash|production/);
});

test('writes use atomic duplicate protection with hashed session markers and stable keys across retries', async () => {
  const session = randomUUID();
  const commands: string[][] = [];
  const service = createWebsiteViewsService(env, async (_, init) => {
    commands.push(JSON.parse(String(init?.body)));
    return json({ result: '12' });
  });
  const data = await service.record(slug, session);
  await service.record(slug, session.toUpperCase());
  assert.deepEqual(commands[0], commands[1]);
  assert.equal(commands[0][0], 'EVAL');
  assert.equal(commands[0][1], RECORD_VIEW_SCRIPT);
  assert.equal(commands[0][2], '2');
  assert.equal(commands[0][5], '2592000');
  assert.ok(
    commands[0][4].endsWith(createHash('sha256').update(session).digest('hex'))
  );
  assert.ok(commands[0][3].includes(`{production:${slug}}`));
  assert.ok(commands[0][4].includes(`{production:${slug}}`));
  assert.doesNotMatch(JSON.stringify(commands), new RegExp(session));
  assert.deepEqual(data, { status: 'available', views: 12, recorded: true });
});

test('development, preview and production totals use different durable namespaces', async () => {
  const keys: string[] = [];
  for (const vercelEnv of [undefined, 'preview', 'production']) {
    await createWebsiteViewsService(
      { ...env, VERCEL_ENV: vercelEnv },
      async (_, init) => {
        keys.push(JSON.parse(String(init?.body))[1]);
        return json({ result: 2 });
      }
    ).read(slug);
  }
  assert.equal(new Set(keys).size, 3);
  assert.ok(keys[0].includes('{development:'));
});

test('malformed, oversized, timed out or rejected database responses do not claim a recorded view', async () => {
  const cases = [
    () => json({ error: 'secret details' }),
    () => json({}),
    () => json({ result: -1 }),
    () => json({ result: 'NaN' }),
    () => json({ result: '2.5' }),
    () => json({ result: 9007199254740992 }),
    () => json({ result: null }),
    () => json({ result: 5 }, 429),
    () =>
      new Response('<html>No</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    () => json({ result: '1', excess: 'x'.repeat(4096) }),
    () => {
      throw new Error('Timeout with private details');
    },
  ];
  for (const response of cases) {
    const data = await createWebsiteViewsService(env, async () =>
      response()
    ).record(slug, randomUUID());
    assert.deepEqual(data, {
      status: 'unavailable',
      views: null,
      recorded: false,
    });
  }
});

test('invalid slugs and session IDs cannot become arbitrary storage keys', async () => {
  let calls = 0;
  const service = createWebsiteViewsService(env, async () => {
    calls++;
    return json({ result: 1 });
  });
  await service.record(slug, 'not-a-uuid');
  await service.read('../private');
  await service.read('a'.repeat(181));
  assert.equal(calls, 0);
});

test('session markers survive reload logic and are independent per article', () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    'sessionStorage'
  );
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
  try {
    const first = websiteViewSession(slug)!;
    assert.equal(first.seen, false);
    assert.equal(websiteViewSession(slug)!.id, first.id);
    rememberWebsiteView(slug, first.id);
    assert.equal(websiteViewSession(slug)!.seen, true);
    assert.equal(websiteViewSession('another-post')!.seen, false);
    data.clear();
    assert.notEqual(websiteViewSession(slug)!.id, first.id);
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('Blocked');
      },
    });
    assert.equal(websiteViewSession(slug), null);
    assert.doesNotThrow(() => rememberWebsiteView(slug, first.id));
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});

test('API only counts published articles with same-origin valid browser POST requests', async () => {
  const originalRead = websiteViewsService.read,
    originalRecord = websiteViewsService.record;
  let reads = 0,
    writes = 0;
  websiteViewsService.read = async () => {
    reads++;
    return { status: 'available', views: 7, recorded: false };
  };
  websiteViewsService.record = async () => {
    writes++;
    return { status: 'available', views: 8, recorded: true };
  };
  const headers = {
    origin: 'https://prameshsharma.com',
    host: 'prameshsharma.com',
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 Chrome/140.0',
    'sec-fetch-site': 'same-origin',
  };
  async function invoke(overrides: Record<string, unknown> = {}) {
    const result = {
      code: 0,
      body: null as unknown,
      headers: {} as Record<string, string>,
    };
    const req = {
      method: 'POST',
      query: { slug },
      headers,
      body: { session: randomUUID() },
      ...overrides,
    };
    const res = {
      setHeader(k: string, v: string) {
        result.headers[k] = v;
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
    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    return result;
  }
  try {
    assert.equal((await invoke({ method: 'PUT' })).code, 405);
    assert.equal((await invoke({ query: { slug: '../private' } })).code, 400);
    assert.equal((await invoke({ query: { slug: ['a'] } })).code, 400);
    assert.equal((await invoke({ query: { slug: 'missing-post' } })).code, 404);
    for (const origin of [
      '',
      'https://example.com',
      'https://prameshsharma.com.evil.test',
      'https://prameshsharma.com/path',
    ])
      assert.equal(
        (await invoke({ headers: { ...headers, origin } })).code,
        403
      );
    assert.equal(
      (
        await invoke({
          headers: { ...headers, 'sec-fetch-site': 'cross-site' },
        })
      ).code,
      403
    );
    assert.equal(
      (await invoke({ headers: { ...headers, 'content-type': 'text/plain' } }))
        .code,
      415
    );
    assert.equal((await invoke({ body: { session: 'bad' } })).code, 400);
    assert.equal(writes, 0);
    await invoke({ method: 'GET' });
    await invoke({ headers: { ...headers, 'user-agent': 'Googlebot' } });
    await invoke({ headers: { ...headers, purpose: 'prefetch' } });
    await invoke({
      headers: { ...headers, 'sec-purpose': 'prefetch;prerender' },
    });
    assert.equal(reads, 4);
    assert.equal(writes, 0);
    const success = await invoke();
    assert.equal(success.code, 200);
    assert.equal(success.headers['Cache-Control'], 'no-store');
    assert.equal(writes, 1);
    // A local article without any Substack counterpart is equally eligible.
    assert.equal(
      (await invoke({ query: { slug: 'how-i-found-an-nih-postbac-lab' } }))
        .code,
      200
    );
    assert.equal(writes, 2);
  } finally {
    websiteViewsService.read = originalRead;
    websiteViewsService.record = originalRecord;
  }
});
