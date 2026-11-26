import { test, expect } from '@playwright/test';

test('purchase link works when the Gumroad overlay script is blocked', async ({ page }) => {
  await page.route('https://gumroad.com/js/gumroad.js', route => route.abort());
  await page.route('https://pramesh6.gumroad.com/l/phd-application-essays', route => route.fulfill({
    contentType: 'text/html', body: '<h1>Gumroad Product</h1>',
  }));
  const stripeRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/checkout')) stripeRequests.push(request.url()); });
  await page.goto('/resources/phd-essay-bundle');
  await page.getByRole('link', { name: 'Buy The Essay Bundle For $5' }).click();
  await expect(page).toHaveURL('https://pramesh6.gumroad.com/l/phd-application-essays');
  expect(stripeRequests).toHaveLength(0);
});

test('UC annotation purchase remains a working link without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    await context.route('https://pramesh6.gumroad.com/l/uc-essay-annotations', route => route.fulfill({
      contentType: 'text/html', body: '<h1>Gumroad Product</h1>',
    }));
    const page = await context.newPage();
    await page.goto('/mentorship/college-essay');
    await expect(page.getByRole('heading', { name: 'The Full Essay' })).toBeVisible();
    await page.getByRole('link', { name: /Get The Annotations/ }).click();
    await expect(page).toHaveURL('https://pramesh6.gumroad.com/l/uc-essay-annotations');
  } finally {
    await context.close();
  }
});

test('the overlay loader is requested once across client-side product navigation', async ({ page }) => {
  let loads = 0;
  // This test concerns our script lifecycle, independent of Gumroad availability.
  await page.route('https://gumroad.com/js/gumroad.js', route => {
    loads += 1;
    return route.fulfill({ contentType: 'application/javascript', body: '' });
  });
  await page.goto('/resources/phd-essay-bundle');
  await expect.poll(() => loads).toBe(1);
  await page.getByRole('navigation', { name: 'Main Navigation' }).getByRole('link', { name: 'Resources', exact: true }).click();
  await page.locator('main a[href="/mentorship/college-essay"]').click();
  await expect(page.getByRole('link', { name: /Get The Annotations/ })).toHaveAttribute('href', 'https://pramesh6.gumroad.com/l/uc-essay-annotations');
  await expect(page.locator('script[src="https://gumroad.com/js/gumroad.js"]')).toHaveCount(1);
  expect(loads).toBe(1);
});
