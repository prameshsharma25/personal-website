import { test, expect } from '@playwright/test';
const result = (views: number, recorded = false) => ({
  status: 'available',
  views,
  recorded,
});
test.beforeEach(async ({ page }) => {
  await page.route('**/pagead/js/adsbygoogle.js?*', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '' })
  );
});

test('article opens count once per tab session, survive reloads, and do not display Substack reader activity', async ({
  page,
}, info) => {
  let writes = 0;
  const sessions = new Set<string>();
  await page.route('**/api/website-views?*', (r) => {
    const write = r.request().method() === 'POST';
    if (write) {
      writes++;
      sessions.add(r.request().postDataJSON().session);
    }
    return r.fulfill({ json: result(24 + sessions.size, write) });
  });
  await page.goto('/posts/a-vision-of-the-future');
  const panel = page.getByRole('region', {
    name: 'Website Views',
    exact: true,
  });
  await expect(panel.locator('strong')).toHaveText('25');
  await expect(panel).toContainText('prameshsharma.com');
  await expect(
    page.getByRole('region', { name: 'Substack Reader Activity' })
  ).toHaveCount(0);
  await panel.screenshot({
    path: info.outputPath('website-views-desktop.png'),
  });
  await page.reload();
  await expect(panel.locator('strong')).toHaveText('25');
  expect(writes).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({ path: info.outputPath('website-views-mobile.png') });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
});

test('disabled creates no session ID and unavailable does not become zero', async ({
  page,
}) => {
  let status = 'disabled';
  await page.route('**/api/website-views?*', (r) =>
    r.fulfill({ json: { status, views: null, recorded: false } })
  );
  await page.goto('/posts/a-vision-of-the-future');
  await expect(page.locator('main h1')).toBeVisible();
  await page.waitForTimeout(450);
  await expect(
    page.getByRole('region', { name: 'Website Views', exact: true })
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem('website-view-session-v1'))
  ).toBeNull();
  status = 'unavailable';
  await page.reload();
  const panel = page.getByRole('region', {
    name: 'Website Views',
    exact: true,
  });
  await expect(panel).toContainText('Currently Unavailable');
  await expect(panel.locator('strong')).toHaveCount(0);
});

test('blocked session storage still displays the public total without recording', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error('Storage blocked');
      },
    })
  );
  let writes = 0;
  await page.route('**/api/website-views?*', (r) => {
    if (r.request().method() === 'POST') writes++;
    return r.fulfill({ json: result(0) });
  });
  await page.goto('/posts/how-i-found-an-nih-postbac-lab');
  await expect(
    page
      .getByRole('region', { name: 'Website Views', exact: true })
      .locator('strong')
  ).toHaveText('0');
  expect(writes).toBe(0);
  await expect(
    page.getByRole('region', { name: 'Substack Reader Activity' })
  ).toHaveCount(0);
});

test('posts collection prefetch does not count; a hidden article waits until visible', async ({
  page,
}) => {
  let writes = 0,
    reads = 0;
  await page.route('**/api/website-views?*', (r) => {
    if (r.request().method() === 'POST') writes++;
    else reads++;
    return r.fulfill({ json: result(writes, r.request().method() === 'POST') });
  });
  await page.goto('/posts');
  await page.locator('a[href="/posts/a-vision-of-the-future"]').first().hover();
  await page.waitForTimeout(500);
  expect(reads).toBe(0);
  expect(writes).toBe(0);
  await page.addInitScript(() =>
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    })
  );
  await page.goto('/posts/a-vision-of-the-future');
  await page.waitForTimeout(450);
  expect(writes).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(
    page
      .getByRole('region', { name: 'Website Views', exact: true })
      .locator('strong')
  ).toHaveText('1');
  expect(writes).toBe(1);
});

test('polling updates totals without recounting and navigation uses the destination article', async ({
  page,
}) => {
  await page.clock.install();
  let count = 10,
    writes = 0;
  await page.route('**/api/website-views?*', (r) => {
    const write = r.request().method() === 'POST';
    if (write) writes++;
    return r.fulfill({
      json: result(
        r.request().url().includes('doppelganger') ? 99 : count,
        write
      ),
    });
  });
  await page.goto('/posts/a-vision-of-the-future');
  const panel = page.getByRole('region', {
    name: 'Website Views',
    exact: true,
  });
  await expect(panel.locator('strong')).toHaveText('10');
  expect(writes).toBe(1);
  count = 15;
  await page.clock.fastForward(60_000);
  await expect(panel.locator('strong')).toHaveText('15');
  expect(writes).toBe(1);
  await page
    .getByRole('navigation', { name: 'Main Navigation' })
    .getByRole('link', { name: 'Posts', exact: true })
    .click();
  await page
    .locator('a[href="/posts/have-you-ever-met-my-doppelganger"]')
    .first()
    .click();
  await expect(panel.locator('strong')).toHaveText('99');
  expect(writes).toBe(2);
});

test('browser through API and Redis: reloads, new sessions and retry after a committed response is lost', async ({
  page,
  browser,
  request,
}) => {
  test.skip(
    process.env.WEBSITE_VIEWS_E2E !== 'true',
    'Requires the isolated Redis REST test backend'
  );
  const slug = 'adjusting-the-focus';
  const api = `/api/website-views?slug=${slug}`;
  const initial = await (await request.get(api)).json();
  expect(initial.status).toBe('available');
  const baseline = initial.views;
  let loseResponse = true;
  await page.route('**/api/website-views?*', async (route) => {
    if (route.request().method() === 'POST' && loseResponse) {
      loseResponse = false;
      await route.fetch(); // The real Lua script commits before the response is lost.
      await route.abort();
    } else await route.continue();
  });
  await page.goto(`/posts/${slug}`);
  const panel = page.getByRole('region', {
    name: 'Website Views',
    exact: true,
  });
  await expect(panel).toContainText('Currently Unavailable');
  expect((await (await request.get(api)).json()).views).toBe(baseline + 1);
  await page.reload();
  await expect(panel.locator('strong')).toHaveText(String(baseline + 1));
  await page.reload();
  await expect(panel.locator('strong')).toHaveText(String(baseline + 1));
  const context = await browser.newContext({
    baseURL: process.env.TEST_BASE_URL,
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
  });
  try {
    const other = await context.newPage();
    await other.route('**/pagead/js/adsbygoogle.js?*', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: '' })
    );
    await other.goto(`/posts/${slug}`);
    await expect(
      other
        .getByRole('region', { name: 'Website Views', exact: true })
        .locator('strong')
    ).toHaveText(String(baseline + 2));
  } finally {
    await context.close();
  }
});
