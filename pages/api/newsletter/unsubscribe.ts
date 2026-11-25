import type { NextApiRequest, NextApiResponse } from 'next';
import { validNewsletterToken } from '../../../lib/newsletter';
import { newsletterHeaders, newsletterFailure, requireNewsletter, requireNewsletterPost, newsletterRpc, NewsletterError } from '../../../lib/newsletter-server';
export const config = { api: { bodyParser: { sizeLimit: '1kb' } }, maxDuration: 60 };
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  newsletterHeaders(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  try {
    const settings = requireNewsletter(); requireNewsletterPost(req, settings);
    if (!validNewsletterToken(req.body?.token)) throw new NewsletterError(400, 'Open the unsubscribe link in one of your newsletter emails.');
    await newsletterRpc('unsubscribe', { token: req.body.token }, settings);
    return res.status(200).json({ message: 'You’re unsubscribed. You won’t receive further newsletters.' });
  } catch (error) { return newsletterFailure(res, error); }
}
