import { test, expect } from '@playwright/test';

const available = {
  status: 'available',
  views: 7,
  checkedAt: '2026-11-26T12:00:00Z',
  windowMinutes: 30,
};
const missing = {
  status: 'unavailable',
  views: null,
  checkedAt: null,
  windowMinutes: 30,
};
test.beforeEach(async ({ page }) => {
  await page.route('**/pagead/js/adsbygoogle.js?*', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '' })
  );
  await page.route('**/api/substack-stats?*', (r) =>
    r.fulfill({
      json: {
        status: 'available',
        likes: 0,
        comments: 3,
        restacks: 2,
        checkedAt: available.checkedAt,
      },
    })
  );
});

test('shows the rolling web count separately from public engagement and fits mobile', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/substack-views?*', (r) =>
    r.fulfill({ json: available })
  );
  await page.goto('/posts/a-vision-of-the-future');
  const panel = page.getByRole('region', { name: 'Substack Reader Activity' });
  const views = panel.getByRole('group', { name: 'Substack Recent Web Views' });
  await expect(views.locator('strong')).toHaveText('7');
  await expect(views).toContainText('Views In The Past 30 Minutes');
  await expect(views).toContainText('including repeat visits');
  await expect(views).toContainText('Email and app reading are not included');
  await expect(panel.locator('dd')).toHaveText(['0', '3', '2']);
  await expect(views.locator('time')).toHaveAttribute(
    'datetime',
    available.checkedAt
  );
  await panel.screenshot({
    path: testInfo.outputPath('recent-views-desktop.png'),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({
    path: testInfo.outputPath('recent-views-mobile.png'),
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('hidden when disabled and unavailable is distinct from a measured zero', async ({
  page,
}) => {
  let result = { ...missing, status: 'disabled' };
  await page.route('**/api/substack-views?*', (r) =>
    r.fulfill({ json: result })
  );
  await page.goto('/posts/a-vision-of-the-future');
  await expect(
    page.getByRole('region', { name: 'Substack Reader Activity' }).locator('dd')
  ).toHaveCount(3);
  const views = page.getByRole('group', { name: 'Substack Recent Web Views' });
  await expect(views).toHaveCount(0);
  result = missing;
  await page.reload();
  await expect(views).toContainText('Currently Unavailable');
  await expect(views.locator('strong')).toHaveCount(0);
  await page.unroute('**/api/substack-views?*');
  await page.route('**/api/substack-views?*', (r) =>
    r.fulfill({ json: { ...available, views: 0 } })
  );
  await page.reload();
  await expect(views.locator('strong')).toHaveText('0');
});

test('refreshes every minute while visible and recovers after failed requests', async ({
  page,
}) => {
  await page.clock.install();
  let calls = 0;
  await page.route('**/api/substack-views?*', (r) => {
    calls++;
    return calls === 2
      ? r.abort()
      : r.fulfill({ json: { ...available, views: calls } });
  });
  await page.goto('/posts/a-vision-of-the-future');
  const views = page.getByRole('group', { name: 'Substack Recent Web Views' });
  await expect(views.locator('strong')).toHaveText('1');
  await page.clock.fastForward(60_000);
  await expect(views).toContainText('Currently Unavailable');
  await expect(views.locator('strong')).toHaveCount(0);
  await page.evaluate(() =>
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    })
  );
  await page.clock.fastForward(60_000);
  expect(calls).toBe(2);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(views.locator('strong')).toHaveText('3');
});

test('client navigation cannot display the previous article response', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/substack-views?*', async (r) => {
    if (r.request().url().includes('a-vision-of-the-future')) {
      await gate;
      await r.fulfill({ json: available });
    } else await r.fulfill({ json: { ...available, views: 11 } });
  });
  await page.goto('/posts/a-vision-of-the-future');
  await page
    .getByRole('navigation', { name: 'Main Navigation' })
    .getByRole('link', { name: 'Posts', exact: true })
    .click();
  release();
  await page
    .locator('a[href="/posts/have-you-ever-met-my-doppelganger"]')
    .first()
    .click();
  await expect(
    page
      .getByRole('group', { name: 'Substack Recent Web Views' })
      .locator('strong')
  ).toHaveText('11');
  await page.goto('/posts/how-i-found-an-nih-postbac-lab');
  await expect(
    page.getByRole('group', { name: 'Substack Recent Web Views' })
  ).toHaveCount(0);
});
