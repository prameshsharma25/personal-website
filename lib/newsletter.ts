export const NEWSLETTER_URL = '/newsletter';
export const SUBSCRIBE_MESSAGE = 'Check your inbox to confirm your subscription. If you’re already subscribed, there’s nothing else to do.';
export type NewsletterCampaign = {
  id: string; subject: string; body: string; articleUrl: string; status: string; createdAt: string;
  total: number; queued: number; sent: number; skipped: number; uncertain: number;
};
export type NewsletterOverview = {
  sender: string; senderAddress: string; footerReady: boolean; confirmed: number; pending: number; unsubscribed: number;
  available: number; campaigns: NewsletterCampaign[];
};
export function validNewsletterEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@<>\x00-\x1f\x7f,;]+@[^\s@<>\x00-\x1f\x7f,;]+\.[^\s@<>\x00-\x1f\x7f,;]+$/.test(value);
}
export function validNewsletterToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(value);
}
