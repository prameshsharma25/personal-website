import type { NextApiRequest, NextApiResponse } from 'next';
import { validNewsletterToken } from '../../../lib/newsletter';
import { newsletterHeaders, newsletterFailure, requireNewsletter, requireNewsletterPost, newsletterRpc, NewsletterError } from '../../../lib/newsletter-server';
export const config = { api: { bodyParser: { sizeLimit: '1kb' } }, maxDuration: 60 };
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  newsletterHeaders(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  try {
    const settings = requireNewsletter(); requireNewsletterPost(req, settings);
    if (!validNewsletterToken(req.body?.token)) throw new NewsletterError(400, 'Open the confirmation link in your email.');
    await newsletterRpc('confirm', { token: req.body.token }, settings);
    return res.status(200).json({ message: 'You’re subscribed. Thanks for following along.' });
  } catch (error) { return newsletterFailure(res, error); }
}
