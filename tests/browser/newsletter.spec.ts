import { test, expect } from '@playwright/test';
import { SUBSCRIBE_MESSAGE, type NewsletterOverview } from '../../lib/newsletter';

test('unconfigured signup stays unavailable and private pages are excluded from indexing', async ({ page, request }) => {
  await page.goto('/newsletter');
  await expect(page.getByText('I’m setting up the mailing list.', { exact: false })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  const response = await request.post('/api/newsletter/subscribe', { data: { email: 'reader@example.com', consent: true } });
  expect(response.status()).toBe(503); expect(response.headers()['cache-control']).toContain('no-store');
  expect((await request.get('/api/newsletter/admin')).status()).toBe(405);
  const sitemap = await (await request.get('/sitemap.xml')).text(); expect(sitemap).not.toContain('/newsletter');
});

test('on-site signup asks for consent and confirmation, and retains input after service failure', async ({ page }) => {
  const submitted: Record<string, unknown>[] = [];
  await page.route('**/api/newsletter/status', route => route.fulfill({ json: { available: true } }));
  await page.route('**/api/newsletter/subscribe', route => {
    submitted.push(route.request().postDataJSON());
    return submitted.length === 1
      ? route.fulfill({ status: 503, json: { error: 'Email sending is paused for now. Please try again later.' } })
      : route.fulfill({ json: { message: SUBSCRIBE_MESSAGE } });
  });
  await page.goto('/resources/lab-search-tracker');
  const form = page.getByRole('region', { name: 'Newsletter signup' });
  await form.getByLabel('Email address', { exact: true }).fill('reader@example.com');
  await form.getByRole('button', { name: 'Subscribe', exact: true }).click();
  expect(submitted).toHaveLength(0);
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Subscribe', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('paused');
  await expect(form.getByLabel('Email address', { exact: true })).toHaveValue('reader@example.com');
  await form.getByRole('button', { name: 'Subscribe', exact: true }).click();
  await expect(form.getByRole('status')).toHaveText(SUBSCRIBE_MESSAGE);
  expect(submitted[1]).toMatchObject({ email: 'reader@example.com', consent: true, website: '' });
  expect(submitted[1].source).toBeTruthy();
});

for (const action of ['confirm', 'unsubscribe'] as const) {
  test(`${action} link hides its token and waits for an explicit action`, async ({ page }) => {
    const token = 'a'.repeat(64), posts: unknown[] = [], analytics: string[] = [], urls: string[] = [];
    page.on('request', request => { urls.push(request.url()); if (request.url().includes('/_vercel/insights')) analytics.push(request.url()); });
    await page.route(`**/api/newsletter/${action}`, route => {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ json: { message: action === 'confirm' ? 'You’re subscribed.' : 'You’re unsubscribed.' } });
    });
    await page.goto(`/newsletter/${action}#token=${token}`);
    await expect(page).toHaveURL(new RegExp(`/newsletter/${action}$`));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    expect(posts).toHaveLength(0); expect(analytics).toHaveLength(0);
    await page.reload(); // The reference survives a refresh, without returning to the URL.
    await page.getByRole('button', { name: action === 'confirm' ? 'Confirm subscription' : 'Unsubscribe', exact: true }).click();
    await expect(page.getByRole('status')).toBeVisible();
    expect(posts).toEqual([{ token }]); expect(urls.some(url => url.includes(token))).toBe(false);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('newsletter-')))).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
}

test('private dashboard saves and reviews the draft before sending, keeps key out of storage', async ({ page }) => {
  const key = 'test-only-admin-key-'.repeat(3), actions: string[] = [];
  const data: NewsletterOverview = { sender: 'owner@example.com', senderAddress: 'Example mailing address', footerReady: true, confirmed: 2, pending: 1, unsubscribed: 0, available: 80, campaigns: [] };
  await page.route('**/api/newsletter/admin', route => {
    expect(route.request().headers()['x-newsletter-admin-key']).toBe(key);
    const { action, payload } = route.request().postDataJSON(); actions.push(action);
    if (action === 'saveDraft') data.campaigns = [{ ...payload, status: 'draft', total: 0, sent: 0, skipped: 0, queued: 0, uncertain: 0, createdAt: '2026-11-24T12:00:00Z' }];
    if (action === 'approveCampaign') { data.campaigns[0].status = 'queued'; data.campaigns[0].queued = 2; }
    if (action === 'sendBatch') { data.campaigns[0].status = 'complete'; data.campaigns[0].queued = 0; data.campaigns[0].sent = 2; data.available -= 2; }
    return route.fulfill({ json: data });
  });
  await page.goto('/newsletter/admin');
  await page.getByLabel('Admin access key').fill(key); await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page.getByText('Sending as owner@example.com')).toBeVisible();
  await page.getByLabel('Subject', { exact: true }).fill('What I learned this month');
  await page.getByLabel('Message', { exact: true }).fill('A short research update.\n\nThanks for reading,\nPramesh');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve and send newsletter' })).toBeDisabled();
  await page.getByRole('button', { name: 'Email me a preview' }).click();
  await expect(page.getByRole('status')).toHaveText('Preview sent to your account.');
  expect(actions).toEqual(['overview', 'saveDraft', 'sendTest']);
  await page.getByRole('checkbox').check();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.local/newsletter-dashboard.png', fullPage: true });
  await page.getByRole('button', { name: 'Approve and send newsletter' }).click();
  await expect(page.getByRole('region', { name: 'Send newsletter' })).toContainText('2 sent · 0 remaining');
  expect(actions.slice(-2)).toEqual(['approveCampaign', 'sendBatch']);
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(key);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByLabel('Admin access key')).toHaveValue('');
});
