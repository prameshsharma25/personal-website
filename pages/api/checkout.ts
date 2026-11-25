import type { NextApiRequest, NextApiResponse } from 'next';
import { checkoutParameters, readPrivateBundle, requireCommerce, stripeClient, CommerceError } from '../../lib/commerce';
import { commerceFailure, privateResponse } from '../../lib/api-response';
export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  privateResponse(res);
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ error: 'Use POST.' }); }
  try {
    const settings = requireCommerce();
    if (req.headers.origin !== settings.origin) throw new CommerceError(403, 'Please start checkout from the product page.');
    const key = req.headers['x-checkout-key'];
    if (typeof key !== 'string' || !/^[0-9a-f-]{36}$/i.test(key)) throw new CommerceError(400, 'Refresh the product page and try again.');
    await readPrivateBundle(settings); // Never open checkout if the delivery file cannot be read.
    const session = await stripeClient(settings).checkout.sessions.create(checkoutParameters(settings), { idempotencyKey: `essay-${key}` });
    if (!session.url?.startsWith('https://checkout.stripe.com/')) throw new Error('Missing hosted checkout URL');
    return res.status(200).json({ url: session.url });
  } catch (error) { return commerceFailure(res,error); }
}
