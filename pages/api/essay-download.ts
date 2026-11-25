import type { NextApiRequest, NextApiResponse } from 'next';
import { paidSession, readPrivateBundle, requireCommerce, CommerceError } from '../../lib/commerce';
import { commerceFailure, privateResponse } from '../../lib/api-response';
import { ESSAY_PRODUCT } from '../../lib/site';
export const config = { api: { bodyParser: { sizeLimit: '2kb' }, responseLimit: '4mb' } };
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  privateResponse(res);
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ error: 'Use POST.' }); }
  try {
    const settings = requireCommerce();
    if (req.headers.origin !== settings.origin) throw new CommerceError(403, 'Open your purchase download page and try again.');
    await paidSession(req.body?.sessionId, settings);
    const data = await readPrivateBundle(settings);
    res.setHeader('Content-Type','application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${ESSAY_PRODUCT.filename}"`);
    return res.status(200).send(data);
  } catch (error) { return commerceFailure(res,error); }
}
