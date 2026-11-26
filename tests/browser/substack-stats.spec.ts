import { test, expect } from '@playwright/test';

const stats = {
  status: 'available',
  checkedAt: '2026-11-26T12:00:00Z',
  likes: 0,
  comments: 3,
  restacks: 2,
};
test.beforeEach(async ({ page }) => {
  await page.route('**/pagead/js/adsbygoogle.js?*', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '' })
  );
});

test('linked posts show measured counts and keep local activity separate', async ({
  page,
}, testInfo) => {
  await page.route('**/api/substack-stats?*', (r) =>
    r.fulfill({ json: stats })
  );
  await page.goto('/posts/a-vision-of-the-future');
  const panel = page.getByRole('region', { name: 'Substack Reader Activity' });
  await expect(panel.locator('dd')).toHaveText(['0', '3', '2']);
  await expect(panel).toContainText('Substack version');
  await expect(
    panel.getByRole('link', { name: 'Join The Discussion' })
  ).toHaveAttribute(
    'href',
    'https://prameshsharma.substack.com/p/a-vision-of-the-future'
  );
  await expect(page.locator('iframe[src*="substack"]')).toHaveCount(0);
  await panel.screenshot({ path: testInfo.outputPath('substack-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({ path: testInfo.outputPath('substack-mobile.png') });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.goto('/posts/how-i-found-an-nih-postbac-lab');
  await expect(
    page.getByRole('region', { name: 'Substack Reader Activity' })
  ).toHaveCount(0);
});

test('partial and stale counts are labeled, and failures do not render synthetic zeros', async ({
  page,
}) => {
  let mode = 'stale';
  await page.route('**/api/substack-stats?*', (r) =>
    r.fulfill({
      json:
        mode === 'stale'
          ? { ...stats, status: 'stale', likes: null }
          : {
              status: 'unavailable',
              checkedAt: null,
              likes: null,
              comments: null,
              restacks: null,
            },
    })
  );
  await page.goto('/posts/a-vision-of-the-future');
  const panel = page.getByRole('region', { name: 'Substack Reader Activity' });
  await expect(panel.locator('dd')).toHaveText(['Not Available', '3', '2']);
  await expect(panel).toContainText('last available counts');
  await expect(panel.locator('time')).toHaveAttribute(
    'dateTime',
    stats.checkedAt
  );
  mode = 'unavailable';
  await page.reload();
  await expect(panel.getByRole('status')).toContainText('unavailable');
  await expect(panel.locator('dd')).toHaveCount(0);
  await expect(
    panel.getByRole('link', { name: 'Join The Discussion' })
  ).toBeVisible();
});

test('a failed request leaves the post readable and navigation never reuses the previous post counts', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/substack-stats?*', async (r) => {
    if (r.request().url().includes('a-vision-of-the-future')) {
      await gate;
      await r.fulfill({ json: stats });
    } else await r.fulfill({ status: 503, json: { error: 'Unavailable' } });
  });
  await page.goto('/posts/a-vision-of-the-future');
  await expect(
    page
      .getByRole('region', { name: 'Substack Reader Activity' })
      .getByRole('status')
  ).toContainText('Loading');
  // Use client navigation, as a reader moving through the site would.
  await page
    .getByRole('navigation', { name: 'Main Navigation' })
    .getByRole('link', { name: 'Posts', exact: true })
    .click();
  release();
  await page
    .locator('a[href="/posts/have-you-ever-met-my-doppelganger"]')
    .first()
    .click();
  const panel = page.getByRole('region', { name: 'Substack Reader Activity' });
  await expect(panel.getByRole('status')).toContainText('unavailable');
  await expect(panel.locator('dd')).toHaveCount(0);
  await expect(page.locator('main h1')).toBeVisible();
});
