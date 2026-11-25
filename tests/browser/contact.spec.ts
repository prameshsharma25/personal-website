import { test, expect } from '@playwright/test';

test('contact without configuration offers a usable draft fallback on mobile', async ({
  page,
}) => {
  let posts = 0;
  await page.route('**/api/sendMessage', async (route) => {
    if (route.request().method() === 'POST') posts++;
    await route.fulfill({ json: { available: false } });
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/contact');
  await expect(page.getByRole('status')).toContainText(
    'temporarily unavailable'
  );
  await expect(
    page.getByRole('button', { name: 'Send Message' })
  ).toBeDisabled();
  await page.getByLabel('Name', { exact: true }).fill('Test Visitor');
  await page
    .getByLabel('Email', { exact: true })
    .fill('visitor@example.invalid');
  await page
    .getByLabel('Message', { exact: true })
    .fill('A & B?\nResearch question.');
  const link = page.getByRole('link', { name: 'Email Me Directly' });
  await expect(link).toBeVisible();
  const href = new URL((await link.getAttribute('href'))!);
  expect(href.pathname).toBe('prameshsharma25@gmail.com');
  expect(href.searchParams.get('body')).toContain('A & B?\nResearch question.');
  expect(posts).toBe(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(321);
});

for (const response of ['html', 'empty-success', 'network'] as const) {
  test(`contact preserves the draft after a ${response} failure`, async ({
    page,
  }) => {
    await page.route('**/api/sendMessage', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { available: true } });
      } else if (response === 'html') {
        await route.fulfill({
          status: 502,
          contentType: 'text/html',
          body: '<h1>Unavailable</h1>',
        });
      } else if (response === 'empty-success') {
        await route.fulfill({ json: {} });
      } else await route.abort('failed');
    });
    await page.goto('/contact');
    await page.getByLabel('Name', { exact: true }).fill('Test Visitor');
    await page
      .getByLabel('Email', { exact: true })
      .fill('visitor@example.invalid');
    await page.getByLabel('Message', { exact: true }).fill('Keep this draft.');
    await page.getByRole('button', { name: 'Send Message' }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'email me directly'
    );
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
      'Keep this draft.'
    );
    await expect(
      page.getByRole('button', { name: 'Send Message' })
    ).toBeEnabled();
  });
}

test('contact direct email remains available without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${test.info().project.use.baseURL}/contact`);
    const link = page.getByRole('link', { name: 'Email Me Directly' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute(
      'href',
      /^mailto:prameshsharma25@gmail.com\?/
    );
  } finally {
    await context.close();
  }
});
