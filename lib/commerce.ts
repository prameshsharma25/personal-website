// Server-only commerce configuration and payment checks. Never import in a client component.
import Stripe from 'stripe';
import { get } from '@vercel/blob';
import nodemailer from 'nodemailer';
import { createHash } from 'node:crypto';
import { ESSAY_PRODUCT, SITE_URL } from './site';

export class CommerceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type CommerceConfig = { key: string; webhookSecret: string; origin: string; blobUrl: string; blobToken?: string; email: string; emailPassword: string; live: boolean };
export function commerceConfig(env: Record<string,string | undefined> = process.env): CommerceConfig | null {
  if (env.ESSAY_SALES_ENABLED !== 'true') return null;
  const key = env.STRIPE_SECRET_KEY || '', webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';
  const email = env.USER_EMAIL || '', emailPassword = env.GMAIL_APP_PASSWORD || '';
  if (!/^(sk|rk)_(test|live)_/.test(key) || !webhookSecret.startsWith('whsec_') || !email.includes('@') || !emailPassword) return null;
  if (!env.BLOB_READ_WRITE_TOKEN && !(env.BLOB_STORE_ID && env.VERCEL_OIDC_TOKEN)) return null;
  try {
    const origin = new URL(env.COMMERCE_ORIGIN || SITE_URL), blob = new URL(env.ESSAY_BUNDLE_BLOB_URL || '');
    const live = /^(sk|rk)_live_/.test(key);
    const localTest = !live && ['localhost','127.0.0.1'].includes(origin.hostname) && origin.protocol === 'http:';
    if ((origin.protocol !== 'https:' && !localTest) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return null;
    if (blob.protocol !== 'https:' || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(blob.hostname) || blob.username || blob.password || blob.search || blob.hash) return null;
    return { key, webhookSecret, origin: origin.origin, blobUrl: blob.href, blobToken: env.BLOB_READ_WRITE_TOKEN, email, emailPassword, live };
  } catch { return null; }
}
export function requireCommerce() {
  const config = commerceConfig();
  if (!config) throw new CommerceError(503, 'Checkout is not available yet. Please try again later.');
  return config;
}
export function stripeClient(config: CommerceConfig) { return new Stripe(config.key, { maxNetworkRetries: 2, timeout: 10000 }); }
export function validSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^cs_(test|live)_[A-Za-z0-9]{16,240}$/.test(value);
}
export function downloadPageUrl(origin: string, sessionId: string) {
  return `${origin}${ESSAY_PRODUCT.path}/thanks#session_id=${encodeURIComponent(sessionId)}`;
}
export function checkoutParameters(config: CommerceConfig): Stripe.Checkout.SessionCreateParams {
  return {
    mode: 'payment', allowed_payment_method_types: ['card'], customer_creation: 'always',
    line_items: [{ quantity: 1, price_data: { currency: ESSAY_PRODUCT.currency, unit_amount: ESSAY_PRODUCT.priceCents,
      product_data: { name: ESSAY_PRODUCT.name, description: ESSAY_PRODUCT.description, metadata: { product_id: ESSAY_PRODUCT.id } } } }],
    metadata: { product_id: ESSAY_PRODUCT.id },
    success_url: `${config.origin}${ESSAY_PRODUCT.path}/thanks#session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.origin}${ESSAY_PRODUCT.path}?checkout=cancelled`,
    custom_text: { submit: { message: 'One-time purchase of two essays and a reading note. Three PDF files are delivered together in a ZIP after payment.' } },
  };
}
export function assertPaidSession(session: Stripe.Checkout.Session, config: Pick<CommerceConfig, 'live'>) {
  const item = session.line_items?.data?.[0];
  const product = item?.price?.product;
  const intent = session.payment_intent;
  const charge = intent && typeof intent !== 'string' ? intent.latest_charge : null;
  if (session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid' || session.livemode !== config.live ||
      session.metadata?.product_id !== ESSAY_PRODUCT.id || session.currency !== ESSAY_PRODUCT.currency || session.amount_subtotal !== ESSAY_PRODUCT.priceCents ||
      session.line_items?.data?.length !== 1 || item?.quantity !== 1 || item?.price?.unit_amount !== ESSAY_PRODUCT.priceCents ||
      !product || typeof product === 'string' || ('deleted' in product && product.deleted) || !('metadata' in product) || product.metadata?.product_id !== ESSAY_PRODUCT.id ||
      !intent || typeof intent === 'string' || intent.status !== 'succeeded' || !charge || typeof charge === 'string' || charge.refunded || charge.amount_refunded > 0 || charge.disputed) {
    throw new CommerceError(403, 'We could not verify an eligible payment for this bundle. If you just paid, wait a moment and try again.');
  }
}
export async function paidSession(sessionId: unknown, config: CommerceConfig, stripe = stripeClient(config)) {
  if (!validSessionId(sessionId)) throw new CommerceError(400, 'Open the download link from your purchase email or checkout confirmation.');
  let session: Stripe.Checkout.Session;
  try { session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items.data.price.product', 'payment_intent.latest_charge'] }); }
  catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) throw new CommerceError(403, 'This purchase reference could not be verified.');
    throw error;
  }
  assertPaidSession(session, config);
  return session;
}
export async function readPrivateBundle(config: CommerceConfig) {
  const result = await get(config.blobUrl, { access: 'private', ...(config.blobToken ? { token: config.blobToken } : {}) });
  if (!result || result.statusCode !== 200) throw new CommerceError(503, 'The download is temporarily unavailable. Please try again shortly.');
  const data = Buffer.from(await new Response(result.stream).arrayBuffer());
  if (data.length > 3_500_000 || data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) throw new CommerceError(503, 'The download is temporarily unavailable.');
  return data;
}
export async function deliverPurchaseEmail(sessionId: string, config: CommerceConfig, stripe = stripeClient(config)) {
  const session = await paidSession(sessionId, config, stripe);
  if (session.metadata?.delivery_email_sent_at) return;
  const email = session.customer_details?.email;
  if (!email) throw new Error('Paid checkout is missing its delivery email');
  const link = downloadPageUrl(config.origin, session.id);
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: config.email, pass: config.emailPassword }, connectionTimeout: 10000, socketTimeout: 15000 });
  await transporter.sendMail({
    from: { name: 'Pramesh Sharma', address: config.email }, to: email,
    messageId: `<essay-${createHash('sha256').update(session.id).digest('hex')}@prameshsharma.com>`,
    subject: 'Your PhD essay bundle — download link',
    text: `Thank you for purchasing My PhD Application Essays.\n\nDownload your two essay PDFs and companion reading note here:\n${link}\n\nKeep this email: the link is your access to the bundle. Please keep it private.\n\nThis edition is for your personal reading and reference.\n\nFor help with your download, reply to this email.\n\nPramesh`,
  });
  // Stripe metadata persists completed delivery across webhook retries. A rare
  // concurrent delivery or a crash between SMTP and this update can repeat an email;
  // access itself is idempotent and always rechecks payment/refund status.
  await stripe.checkout.sessions.update(session.id, { metadata: { delivery_email_sent_at: new Date().toISOString() } });
}
