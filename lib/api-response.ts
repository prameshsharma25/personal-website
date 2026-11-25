import type { NextApiResponse } from 'next';
import { CommerceError } from './commerce';
export function privateResponse(res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
export function commerceFailure(res: NextApiResponse, error: unknown) {
  if (error instanceof CommerceError) return res.status(error.status).json({ error: error.message });
  // Avoid logging Stripe objects: they can contain customer data and access links.
  console.error('Commerce request failed', error instanceof Error ? error.name : 'UnknownError');
  return res.status(503).json({ error: 'This request could not be completed. Please try again shortly.' });
}
