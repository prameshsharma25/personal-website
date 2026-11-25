// Import only from API routes and server-side page functions.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { SITE_URL } from './site';

export class NewsletterError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type NewsletterConfig = { origin: string; endpoint: string; secret: string; adminKey: string };
export function newsletterConfig(env: Record<string, string | undefined> = process.env): NewsletterConfig | null {
  if (env.NEWSLETTER_ENABLED !== 'true') return null;
  const endpoint = env.NEWSLETTER_GOOGLE_SCRIPT_URL || '', secret = env.NEWSLETTER_SHARED_SECRET || '', adminKey = env.NEWSLETTER_ADMIN_KEY || '';
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint) || secret.length < 32 || adminKey.length < 32 || secret === adminKey) return null;
  try {
    const url = new URL(env.NEWSLETTER_ORIGIN || SITE_URL);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:';
    if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return { origin: url.origin, endpoint, secret, adminKey };
  } catch { return null; }
}
export function requireNewsletter() {
  const settings = newsletterConfig();
  if (!settings) throw new NewsletterError(503, 'Email signup is not available yet. Please check back soon.');
  return settings;
}
export function newsletterHeaders(res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
export function requireNewsletterPost(req: NextApiRequest, config: NewsletterConfig) {
  if (req.method !== 'POST') throw new NewsletterError(405, 'Use POST.');
  if (req.headers.origin !== config.origin) throw new NewsletterError(403, 'Please use the form on this website.');
}
export function validAdminKey(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || provided.length > 512) return false;
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(provided), hash(expected));
}
export function requestFingerprint(req: NextApiRequest, config: NewsletterConfig) {
  // Vercel controls this header in deployment. Never trust a browser's X-Forwarded-For.
  const header = process.env.VERCEL ? req.headers['x-vercel-forwarded-for'] : undefined;
  const ip = typeof header === 'string' ? header.split(',')[0].trim() : req.socket.remoteAddress || 'unknown';
  return createHmac('sha256', config.secret).update(ip).digest('hex');
}
const publicErrors: Record<string, [number, string]> = {
  invalid: [400, 'Please check the information you entered.'],
  token: [400, 'This link has expired or is no longer valid. You can sign up again for a new confirmation email.'],
  rate: [429, 'Please wait a while before trying again.'],
  quota: [503, 'Email sending is paused for now. Please try again later.'],
  busy: [503, 'Another request is finishing. Please try again shortly.'],
  footer: [400, 'Add the sender address in your newsletter settings before sending.'],
  state: [409, 'This newsletter has changed. Refresh its status before continuing.'],
};
export async function newsletterRpc<T>(action: string, payload: Record<string, unknown>, config: NewsletterConfig, fetcher: typeof fetch = fetch): Promise<T> {
  const signal = AbortSignal.timeout(35000);
  try {
    let response = await fetcher(config.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload, secret: config.secret, origin: config.origin }),
      redirect: 'manual', cache: 'no-store', signal,
    });
    // Apps Script ContentService redirects to Google-hosted output. Never forward
    // our secret to that URL or to a Google login page.
    if ([301, 302, 303].includes(response.status)) {
      const location = new URL(response.headers.get('location') || '');
      if (location.protocol !== 'https:' || location.hostname !== 'script.googleusercontent.com' || location.username || location.password) throw new Error('Unexpected script redirect');
      response = await fetcher(location.href, { method: 'GET', redirect: 'error', cache: 'no-store', signal });
    }
    if (!response.ok) throw new Error('Script service unavailable');
    const data = await response.json();
    if (data.ok !== true) {
      const known = publicErrors[data.error];
      if (known) throw new NewsletterError(...known);
      throw new Error('Script rejected request');
    }
    return data.result as T;
  } catch (error) {
    if (error instanceof NewsletterError) throw error;
    throw new NewsletterError(503, 'The newsletter service could not finish this request. Check its status before trying a send again.');
  }
}
export function newsletterFailure(res: NextApiResponse, error: unknown) {
  if (error instanceof NewsletterError) return res.status(error.status).json({ error: error.message });
  return res.status(500).json({ error: 'The request could not be completed. Please try again.' });
}
