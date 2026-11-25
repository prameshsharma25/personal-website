import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextApiRequest, NextApiResponse } from 'next';
import admin from '../pages/api/newsletter/admin';
import subscribe from '../pages/api/newsletter/subscribe';
import confirm from '../pages/api/newsletter/confirm';
import unsubscribe from '../pages/api/newsletter/unsubscribe';
import status from '../pages/api/newsletter/status';

const settings = { NEWSLETTER_ENABLED: 'true', NEWSLETTER_GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/test-only/exec', NEWSLETTER_SHARED_SECRET: 'a'.repeat(64), NEWSLETTER_ADMIN_KEY: 'b'.repeat(64), NEWSLETTER_ORIGIN: 'https://prameshsharma.com' };
type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;
async function call(handler: Handler, body: unknown = {}, options: { method?: string; origin?: string; key?: string; query?: object } = {}) {
  const result = { code: 200, body: undefined as any, headers: {} as Record<string, string> };
  const req = { method: options.method || 'POST', headers: { origin: options.origin || settings.NEWSLETTER_ORIGIN, 'x-newsletter-admin-key': options.key }, body, query: options.query || {}, socket: { remoteAddress: '192.0.2.1' } } as unknown as NextApiRequest;
  const res = { setHeader(name: string, value: string) { result.headers[name] = value; return this; }, status(code: number) { result.code = code; return this; }, json(body: unknown) { result.body = body; return this; }, end() { return this; } } as unknown as NextApiResponse;
  await handler(req, res); return result;
}

test('configured API enforces admin authentication and origin before Google is contacted', async t => {
  const original = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]])), requests: any[] = [];
  Object.assign(process.env, settings);
  t.after(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => { requests.push(JSON.parse(String(options.body))); return Response.json({ ok: true, result: { accepted: true } }); });
  for (const options of [{}, { key: 'incorrect' }, { query: { key: settings.NEWSLETTER_ADMIN_KEY } }]) assert.equal((await call(admin, { action: 'sendBatch' }, options)).code, 401);
  assert.equal((await call(admin, { action: 'sendBatch' }, { key: settings.NEWSLETTER_ADMIN_KEY, origin: 'https://evil.test' })).code, 403);
  assert.equal((await call(admin, { action: 'subscribe' }, { key: settings.NEWSLETTER_ADMIN_KEY })).code, 400);
  assert.equal(requests.length, 0);
  const response = await call(admin, { action: 'overview' }, { key: settings.NEWSLETTER_ADMIN_KEY });
  assert.equal(response.code, 200); assert.match(response.headers['Cache-Control'], /no-store/);
  assert.equal(requests.length, 1); assert.equal(requests[0].secret, settings.NEWSLETTER_SHARED_SECRET);
  assert.ok(!JSON.stringify(response).includes(settings.NEWSLETTER_SHARED_SECRET));
});

test('configured public routes validate consent and tokens without exposing connection secrets', async t => {
  const original = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]])), requests: any[] = [];
  Object.assign(process.env, settings);
  t.after(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => { requests.push(JSON.parse(String(options.body))); return Response.json({ ok: true, result: { accepted: true } }); });
  assert.equal((await call(subscribe, { email: 'reader@example.com' })).code, 400);
  assert.equal((await call(subscribe, { email: 'a@example.com,b@example.com', consent: true })).code, 400);
  assert.equal((await call(subscribe, { email: 'reader@example.com', consent: true, website: 'bot' })).code, 200);
  for (const handler of [confirm, unsubscribe]) {
    assert.equal((await call(handler, {}, { method: 'GET' })).code, 405);
    assert.equal((await call(handler, { token: 'invalid' })).code, 400);
  }
  assert.equal(requests.length, 0);
  assert.deepEqual((await call(status, {}, { method: 'GET' })).body, { available: true });
  assert.equal((await call(subscribe, { email: ' READER@example.com ', consent: true, source: 'tracker' })).code, 200);
  assert.equal(requests[0].payload.email, 'reader@example.com'); assert.match(requests[0].payload.ipHash, /^[a-f0-9]{64}$/);
  const token = 'c'.repeat(64);
  for (const handler of [confirm, unsubscribe]) assert.equal((await call(handler, { token })).code, 200);
  assert.deepEqual(requests.map(request => request.action), ['subscribe', 'confirm', 'unsubscribe']);
});
