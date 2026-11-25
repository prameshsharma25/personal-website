import type { NextApiRequest, NextApiResponse } from 'next';
import { newsletterConfig, newsletterHeaders } from '../../../lib/newsletter-server';
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  newsletterHeaders(res);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  return res.status(200).json({ available: Boolean(newsletterConfig()) });
}
