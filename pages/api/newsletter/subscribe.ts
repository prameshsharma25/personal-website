import type { NextApiRequest, NextApiResponse } from 'next';
import { SUBSCRIBE_MESSAGE, validNewsletterEmail } from '../../../lib/newsletter';
import { newsletterHeaders, newsletterFailure, requireNewsletter, requireNewsletterPost, newsletterRpc, requestFingerprint, NewsletterError } from '../../../lib/newsletter-server';
export const config = { api: { bodyParser: { sizeLimit: '2kb' } }, maxDuration: 60 };
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  newsletterHeaders(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  try {
    const settings = requireNewsletter(); requireNewsletterPost(req, settings);
    if (req.body?.website) return res.status(200).json({ message: SUBSCRIBE_MESSAGE });
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!validNewsletterEmail(email) || req.body?.consent !== true) throw new NewsletterError(400, 'Enter your email and agree to receive new posts.');
    await newsletterRpc('subscribe', { email, ipHash: requestFingerprint(req, settings), source: typeof req.body.source === 'string' ? req.body.source.slice(0, 80) : 'website' }, settings);
    return res.status(200).json({ message: SUBSCRIBE_MESSAGE });
  } catch (error) { return newsletterFailure(res, error); }
}
