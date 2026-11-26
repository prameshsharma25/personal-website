import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createWebsiteViewsService } from '../lib/website-views-server';

const url = process.env.WEBSITE_VIEWS_TEST_REST_URL;
const token = process.env.WEBSITE_VIEWS_TEST_REST_TOKEN;
test(
  'actual Redis Lua: concurrency, retry after lost response, durable reads, marker expiry and namespace isolation',
  { skip: !url || !token },
  async () => {
    const namespace = `test-${randomUUID()}`;
    const slug = 'test-article',
      session = randomUUID();
    const base = `personal-website:views:v1:{${namespace}:${slug}}`;
    const key = `${base}:total`;
    const marker = (id: string) =>
      `${base}:seen:${createHash('sha256').update(id).digest('hex')}`;
    const sessions = [
      session,
      ...Array.from({ length: 12 }, () => randomUUID()),
    ];
    const env = {
      WEBSITE_VIEWS_ENABLED: 'true',
      UPSTASH_REDIS_REST_URL: url!,
      UPSTASH_REDIS_REST_TOKEN: token!,
      WEBSITE_VIEWS_NAMESPACE: namespace,
    };
    const command = async (args: string[]) => {
      const r = await fetch(url!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      return d.result;
    };
    try {
      const service = createWebsiteViewsService(env);
      assert.equal((await service.read(slug)).views, 0);
      const repeats = await Promise.all(
        Array.from({ length: 20 }, () => service.record(slug, session))
      );
      assert.ok(repeats.every((r) => r.recorded && r.views === 1));
      await Promise.all(
        sessions.slice(1).map((id) => service.record(slug, id))
      );
      assert.equal((await createWebsiteViewsService(env).read(slug)).views, 13);
      // The database commits; the first client response is lost. Retry uses the same ID.
      const lostSession = randomUUID();
      sessions.push(lostSession);
      let lost = true;
      const retryService = createWebsiteViewsService(
        env,
        async (input, init) => {
          const response = await fetch(input, init);
          if (lost) {
            lost = false;
            throw new Error('Connection lost after commit');
          }
          return response;
        }
      );
      assert.equal(
        (await retryService.record(slug, lostSession)).status,
        'unavailable'
      );
      assert.equal((await retryService.record(slug, lostSession)).views, 14);
      assert.equal(Number(await command(['TTL', key])), -1);
      const ttl = Number(await command(['TTL', marker(session)]));
      assert.ok(ttl > 2591900 && ttl <= 2592000);
      const other = createWebsiteViewsService({
        ...env,
        WEBSITE_VIEWS_NAMESPACE: `other-${namespace}`,
      });
      assert.equal((await other.read(slug)).views, 0);
    } finally {
      await command(['DEL', key, ...sessions.map(marker)]);
    }
  }
);
