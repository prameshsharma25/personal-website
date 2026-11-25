import type { NextApiRequest, NextApiResponse } from 'next';
import { newsletterHeaders, newsletterFailure, requireNewsletter, requireNewsletterPost, newsletterRpc, validAdminKey, NewsletterError } from '../../../lib/newsletter-server';
export const config = { api: { bodyParser: { sizeLimit: '20kb' } }, maxDuration: 60 };
const actions = ['overview', 'saveDraft', 'sendTest', 'approveCampaign', 'sendBatch', 'cancelCampaign', 'suppressSubscriber'];
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  newsletterHeaders(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  try {
    const settings = requireNewsletter(); requireNewsletterPost(req, settings);
    if (!validAdminKey(req.headers['x-newsletter-admin-key'], settings.adminKey)) throw new NewsletterError(401, 'The admin access key is not correct.');
    const action = req.body?.action;
    if (!actions.includes(action)) throw new NewsletterError(400, 'Unknown newsletter action.');
    const payload = req.body?.payload;
    if (payload && (typeof payload !== 'object' || Array.isArray(payload))) throw new NewsletterError(400, 'Invalid newsletter details.');
    const result = await newsletterRpc(action, payload || {}, settings);
    return res.status(200).json(result);
  } catch (error) { return newsletterFailure(res, error); }
}
