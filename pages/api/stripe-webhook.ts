import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { deliverPurchaseEmail, requireCommerce, stripeClient } from '../../lib/commerce';
import { commerceFailure, privateResponse } from '../../lib/api-response';
import { ESSAY_PRODUCT } from '../../lib/site';
export const config = { api: { bodyParser: false } };
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  privateResponse(res);
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  try {
    const settings = requireCommerce(), stripe = stripeClient(settings);
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') return res.status(400).json({ error: 'Missing signature.' });
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 1_000_000) return res.status(413).end(); chunks.push(bytes); }
    let event: Stripe.Event;
    try { event = stripe.webhooks.constructEvent(Buffer.concat(chunks), signature, settings.webhookSecret); }
    catch { return res.status(400).json({ error: 'Invalid webhook signature.' }); }
    if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.product_id === ESSAY_PRODUCT.id && session.payment_status === 'paid') await deliverPurchaseEmail(session.id, settings, stripe);
    }
    return res.status(200).json({ received: true });
  } catch (error) { return commerceFailure(res,error); }
}
