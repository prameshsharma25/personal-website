import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextApiRequest } from 'next';
import { validNewsletterEmail, validNewsletterToken } from '../lib/newsletter';
import { newsletterConfig, newsletterRpc, NewsletterError, validAdminKey, requireNewsletterPost, requestFingerprint } from '../lib/newsletter-server';
const env = { NEWSLETTER_ENABLED: 'true', NEWSLETTER_GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/example-test-deployment/exec', NEWSLETTER_SHARED_SECRET: 'transport_' + 'a'.repeat(64), NEWSLETTER_ADMIN_KEY: 'admin_' + 'b'.repeat(64), NEWSLETTER_ORIGIN: 'https://prameshsharma.com' };
const settings = newsletterConfig(env)!;

test('newsletter stays unavailable until all private connection settings are present', () => {
  assert.ok(settings);
  for (const key of Object.keys(env).filter(k => k !== 'NEWSLETTER_ORIGIN')) assert.equal(newsletterConfig({ ...env, [key]: '' }), null);
  for (const endpoint of ['https://evil.test/exec', 'https://script.google.com.evil.test/macros/s/test/exec', 'https://script.google.com/macros/s/test/dev']) assert.equal(newsletterConfig({ ...env, NEWSLETTER_GOOGLE_SCRIPT_URL: endpoint }), null);
  assert.equal(newsletterConfig({ ...env, NEWSLETTER_ADMIN_KEY: env.NEWSLETTER_SHARED_SECRET }), null);
  assert.equal(newsletterConfig({ ...env, NEWSLETTER_ORIGIN: 'https://site.test/path' }), null);
  assert.ok(newsletterConfig({ ...env, NEWSLETTER_ORIGIN: 'http://127.0.0.1:3000' }));
});
test('signup and subscription tokens reject recipient lists and malformed input', () => {
  assert.ok(validNewsletterEmail('reader+newsletter@example.com'));
  for (const email of ['', 'not-email', 'a@example.com,b@example.com', 'Name <a@example.com>', 'a@example.com\r\nBcc:b@example.com', 'a\0@example.com']) assert.equal(validNewsletterEmail(email), false);
  assert.ok(validNewsletterToken('a'.repeat(64)));
  for (const token of ['', {}, 'https://example.com', 'a'.repeat(129)]) assert.equal(validNewsletterToken(token), false);
});
test('admin key and origin are required and cannot be supplied through a query', () => {
  assert.ok(validAdminKey(settings.adminKey, settings.adminKey));
  for (const key of [undefined, '', 'wrong', [settings.adminKey]]) assert.equal(validAdminKey(key, settings.adminKey), false);
  assert.throws(() => requireNewsletterPost({ method: 'POST', headers: { origin: 'https://evil.test' } } as NextApiRequest, settings), NewsletterError);
  assert.throws(() => requireNewsletterPost({ method: 'GET', headers: { origin: settings.origin } } as NextApiRequest, settings), NewsletterError);
});
test('subscriber rate-limit fingerprints are salted and ignore spoofed forwarding headers locally', () => {
  const req = { headers: {}, socket: { remoteAddress: '192.0.2.1' } } as NextApiRequest;
  const hash = requestFingerprint(req, settings);
  assert.match(hash, /^[a-f0-9]{64}$/); assert.ok(!hash.includes('192.0.2.1'));
  assert.equal(requestFingerprint({ ...req, headers: { 'x-forwarded-for': '192.0.2.2' } } as unknown as NextApiRequest, settings), hash);
});
test('Google output redirect uses GET without forwarding private credentials', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const fetcher = (async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1 ? new Response(null, { status: 302, headers: { location: 'https://script.googleusercontent.com/macros/echo?result=test' } }) : Response.json({ ok: true, result: { accepted: true } });
  }) as typeof fetch;
  assert.deepEqual(await newsletterRpc('subscribe', { email: 'reader@example.com' }, settings, fetcher), { accepted: true });
  assert.equal(JSON.parse(String(calls[0].options?.body)).secret, settings.secret);
  assert.equal(calls[1].options?.method, 'GET'); assert.equal(calls[1].options?.body, undefined);
  assert.ok(!calls[1].url.includes(settings.secret));
});
test('unexpected redirects and ambiguous failures fail without a second send request', async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://evil.test/collect' } }); }) as typeof fetch;
  await assert.rejects(newsletterRpc('sendBatch', { id: 'test' }, settings, fetcher), NewsletterError); assert.equal(calls, 1);
  await assert.rejects(newsletterRpc('subscribe', {}, settings, (async () => Response.json({ ok: false, error: 'quota' })) as typeof fetch), (error: NewsletterError) => error.status === 503);
});
