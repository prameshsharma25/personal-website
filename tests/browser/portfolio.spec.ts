import { test, expect } from '@playwright/test';
import type { PortfolioReport } from '../../lib/portfolio';

const report: PortfolioReport = {
  status: 'available',
  mode: 'synced',
  stale: false,
  checkedAt: '2026-11-27T16:00:00Z',
  snapshot: {
    currency: 'USD',
    total: 2500,
    balanceAsOf: '2026-11-27T15:00:00Z',
    holdingsAsOf: '2026-11-27T15:05:00Z',
    incompleteHoldings: false,
    holdings: [
      {
        symbol: 'TEST',
        name: 'Test Holding',
        percent: 40,
        marketValue: 1000,
        costBasis: 800,
        unrealizedGain: 200,
        unrealizedGainPercent: 25,
        side: 'long',
      },
      {
        symbol: 'ABC',
        name: 'Another Test Holding',
        percent: 20,
        marketValue: 500,
        costBasis: null,
        unrealizedGain: null,
        unrealizedGainPercent: null,
        side: 'long',
      },
    ],
  },
};

test('unconnected portfolio is honest, coffee works, and no public account selector exists', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/road-to-10000');
  await expect(
    page.getByRole('heading', { name: 'Road To $10,000.' })
  ).toBeVisible();
  await expect(
    page.getByText('First Update Coming Soon', { exact: true })
  ).toBeVisible();
  await expect(page.locator('[data-portfolio-value]')).toHaveText(
    'Awaiting First Update'
  );
  await expect(page.getByRole('meter')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: /Buy Me A Coffee/ })
  ).toHaveAttribute('href', 'https://buymeacoffee.com/prameshsharma');
  await expect(
    page.getByRole('link', { name: /My Robinhood Referral/ })
  ).toHaveAttribute('href', 'https://join.robinhood.com/pramess-724360');
  await expect(page.getByText(/Referral Disclosure:/)).toBeVisible();
  const data = await request.get('/api/portfolio');
  expect(data.status()).toBe(200);
  expect((await data.json()).snapshot).toBeNull();
  expect(data.headers()['cache-control']).toBe('no-store');
  expect(
    (
      await request.post('/api/portfolio', { data: { accountId: 'another' } })
    ).status()
  ).toBe(405);
  expect((await request.get('/api/portfolio?accountId=another')).status()).toBe(
    400
  );
  const sitemap = await request.get('/sitemap.xml');
  expect(await sitemap.text()).toContain('/road-to-10000');
  expect(errors).toEqual([]);
});

const observations = [120, 2, 1, 0].map((days, i) => ({
  asOf: new Date(Date.now() - days * 86400000).toISOString(),
  value: [800, 900, 950, 1000][i],
}));

test('holding details show basis and unrealized gain with pointer and keyboard chart controls', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({ json: report })
  );
  await page.route('**/api/portfolio-history?*', (route) =>
    route.fulfill({
      json: { status: 'available', symbol: 'TEST', points: observations },
    })
  );
  await page.goto('/road-to-10000');
  const holding = page.getByRole('button', {
    name: /TEST 40.00% Test Holding/,
  });
  await holding.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('region', { name: 'TEST Test Holding' });
  await expect(panel).toBeVisible();
  await expect(holding).toHaveAttribute('aria-expanded', 'true');
  await expect(
    panel.getByRole('heading', { name: 'TEST Test Holding' })
  ).toBeFocused();
  await expect(
    panel.getByRole('definition').filter({ hasText: '$800.00' })
  ).toBeVisible();
  await expect(panel.locator('dd[data-direction="gain"]')).toHaveText(
    '+$200.00+25.00%'
  );
  await expect(panel.locator('[data-history-value]')).toHaveText('$1,000.00');
  const chart = panel.getByRole('img', { name: /4 recorded observations/ });
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  await page.mouse.move(box!.x + box!.width * 0.1, box!.y + box!.height * 0.5);
  await expect(panel.locator('[data-history-value]')).toHaveText('$800.00');
  const slider = panel.getByRole('slider', { name: 'Recorded Observation' });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(panel.locator('[data-history-value]')).toHaveText('$1,000.00');
  await page.keyboard.press('ArrowLeft');
  await expect(panel.locator('[data-history-value]')).toHaveText('$950.00');
  await panel.getByRole('button', { name: '1M', exact: true }).click();
  await expect(panel.getByRole('img')).toHaveAttribute(
    'aria-label',
    /3 recorded observations/
  );
  await panel.getByText('View Recorded Values').click();
  await expect(panel.getByRole('table')).toBeVisible();
  await expect(panel.getByRole('row')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(holding).toBeFocused();
  await expect(holding).toHaveAttribute('aria-expanded', 'false');
  expect(errors).toEqual([]);
});

test('single observations, missing basis and unavailable history remain honest on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({ json: report })
  );
  let status = 'available';
  await page.route('**/api/portfolio-history?*', (route) =>
    route.fulfill({
      json: {
        status,
        symbol: 'ABC',
        points:
          status === 'available' ? [{ ...observations[3], value: 500 }] : [],
      },
    })
  );
  await page.goto('/road-to-10000');
  await page
    .getByRole('button', { name: /ABC 20.00% Another Test Holding/ })
    .click();
  const panel = page.getByRole('region', { name: 'ABC Another Test Holding' });
  await expect(panel.getByText(/First snapshot recorded/)).toBeVisible();
  await expect(panel.getByRole('img')).toHaveAttribute(
    'viewBox',
    '0 0 400 260'
  );
  await expect(
    panel.getByText(/has not supplied a usable cost basis/)
  ).toBeVisible();
  await expect(panel.getByText('Not Available', { exact: true })).toHaveCount(
    2
  );
  await expect(panel.getByRole('slider')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  expect(await panel.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'none'
  );
  await panel.getByRole('button', { name: 'Close Holding Details' }).click();
  status = 'unavailable';
  await page
    .getByRole('button', { name: /ABC 20.00% Another Test Holding/ })
    .click();
  await expect(
    panel.getByText('Position History Is Temporarily Unavailable')
  ).toBeVisible();
  await expect(panel.getByRole('img')).toHaveCount(0);
  await expect(panel.getByText('$500.00', { exact: true })).toBeVisible();
  status = 'available';
  await panel.getByRole('button', { name: 'Try History Again' }).click();
  await expect(panel.getByText(/First snapshot recorded/)).toBeVisible();
});

test('changing holdings cannot mix history responses and unpublished data clears the open panel', async ({
  page,
}) => {
  let release: () => void = () => {};
  let started: () => void = () => {};
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({ json: report })
  );
  await page.route('**/api/portfolio-history?*', async (route) => {
    const symbol = new URL(route.request().url()).searchParams.get('symbol');
    if (symbol === 'TEST') {
      started();
      await waiting;
    }
    await route
      .fulfill({
        json: {
          status: 'available',
          symbol,
          points: symbol === 'TEST' ? observations : [],
        },
      })
      .catch(() => {});
  });
  await page.goto('/road-to-10000');
  await page.getByRole('button', { name: /TEST 40.00% Test Holding/ }).click();
  await requested;
  await page
    .getByRole('button', { name: /ABC 20.00% Another Test Holding/ })
    .click();
  release();
  const panel = page.getByRole('region', { name: 'ABC Another Test Holding' });
  await expect(
    panel.getByText('Collecting Position History', { exact: true })
  ).toBeVisible();
  await expect(panel.getByRole('img')).toHaveCount(0);
  await expect(panel.locator('[data-history-value]')).toHaveCount(0);
  await page.unroute('**/api/portfolio');
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({
      json: {
        status: 'unconfigured',
        mode: null,
        snapshot: null,
        checkedAt: null,
        stale: false,
      },
    })
  );
  await page.getByRole('button', { name: 'Check For Update' }).click();
  await expect(panel).toHaveCount(0);
});

test('synced holdings show weights, keyboard selection, sorting, and contribution math', async ({
  page,
}) => {
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({ json: report })
  );
  await page.goto('/road-to-10000');
  await expect(page.locator('[data-portfolio-value]')).toHaveText('$2,500.00');
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '25');
  await expect(
    page.getByText('Automatically Synced', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/brokerage updates and prices may be delayed/)
  ).toBeVisible();
  const holding = page.getByRole('button', {
    name: /TEST 40.00% Test Holding/,
  });
  await holding.focus();
  await page.keyboard.press('Enter');
  await expect(holding).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByText(/represents 40.00% of the account value/)
  ).toBeVisible();
  await page.getByLabel('Sort By').selectOption('name');
  expect(
    await page.getByRole('button', { name: /%/ }).first().textContent()
  ).toContain('ABC');
  await page
    .getByLabel('Monthly Contribution ($)', { exact: true })
    .fill('250');
  await expect(page.locator('output')).toContainText('30 Months');
  await page.getByLabel('Starting Balance ($)', { exact: true }).fill('10000');
  await expect(page.locator('output')).toContainText('Already At The Goal');
  await page
    .getByRole('button', { name: 'Use Current Portfolio Balance' })
    .click();
  await expect(
    page.getByLabel('Starting Balance ($)', { exact: true })
  ).toHaveValue('2500');
  await expect(page.locator('[data-portfolio-value]')).toHaveText('$2,500.00');
  await page.getByLabel('Monthly Contribution ($)', { exact: true }).fill('0');
  await expect(page.locator('output')).toContainText(
    'Enter A Monthly Contribution'
  );
});

test('manual and stale updates stay labeled, API failure does not erase the last visible balance', async ({
  page,
}) => {
  let fail = false;
  await page.route('**/api/portfolio', (route) =>
    fail
      ? route.fulfill({ status: 503, body: 'Unavailable' })
      : route.fulfill({ json: { ...report, mode: 'manual', stale: true } })
  );
  await page.goto('/road-to-10000');
  await expect(
    page.getByText('Dated Portfolio Snapshot', { exact: true })
  ).toBeVisible();
  await expect(page.getByText(/This is an older snapshot/)).toBeVisible();
  await expect(page.getByText(/Shared manually/)).toBeVisible();
  fail = true;
  await page.getByRole('button', { name: 'Check For Update' }).click();
  await expect(
    page.getByRole('button', { name: 'Check For Update' })
  ).toBeEnabled();
  await expect(page.locator('[data-portfolio-value]')).toHaveText('$2,500.00');
  await expect(page.getByText(/This is an older snapshot/)).toBeVisible();
  await page.unroute('**/api/portfolio');
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({
      json: {
        status: 'unavailable',
        mode: null,
        snapshot: null,
        checkedAt: null,
        stale: false,
      },
    })
  );
  await page.getByRole('button', { name: 'Check For Update' }).click();
  await expect(
    page.getByRole('button', { name: 'Check For Update' })
  ).toBeEnabled();
  await expect(page.locator('[data-portfolio-value]')).toHaveText('$2,500.00');
  // Disabling publication must clear the old values, unlike a temporary outage.
  await page.unroute('**/api/portfolio');
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({
      json: {
        status: 'unconfigured',
        mode: null,
        snapshot: null,
        checkedAt: null,
        stale: false,
      },
    })
  );
  await page.getByRole('button', { name: 'Check For Update' }).click();
  await expect(page.locator('[data-portfolio-value]')).toHaveText(
    'Awaiting First Update'
  );
});

test('mobile layout fits, empty and over-goal portfolios render, and calculator inputs stay usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({
      json: {
        ...report,
        snapshot: { ...report.snapshot, total: 12500, holdings: [] },
      },
    })
  );
  await page.goto('/road-to-10000');
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
  await expect(
    page.getByRole('heading', { name: 'No Stocks Or Funds To Display' })
  ).toBeVisible();
  await page.getByLabel('Starting Balance ($)', { exact: true }).fill('500');
  await page.getByRole('button', { name: '$500/Month', exact: true }).click();
  await expect(page.locator('output')).toContainText('19 Months');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page
    .getByRole('link', { name: 'Support My Work', exact: false })
    .click();
  await expect(
    page.getByRole('link', { name: /Buy Me A Coffee/ })
  ).toBeInViewport();
});

test('navigation and support remain accessible without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${test.info().project.use.baseURL}/road-to-10000`);
  await expect(
    page.getByRole('heading', { name: 'Road To $10,000.' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Buy Me A Coffee/ })
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Main Navigation' })
      .getByRole('link', { name: /Road To/ })
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('link', { name: 'Road To $10,000', exact: true })
      .filter({ has: page.locator('svg') })
  ).toHaveAttribute('aria-current', 'page');
  await context.close();
});

test('floating 10K shortcut stops jitter after activation, remembers it, and stays off Tools routes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const shortcut = page
    .getByRole('link', { name: 'Road To $10,000', exact: true })
    .filter({ has: page.locator('svg') });
  await expect(shortcut).toBeVisible();
  await expect
    .poll(() => shortcut.evaluate((el) => getComputedStyle(el).animationName))
    .toMatch(/badgeJitter/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => shortcut.evaluate((el) => getComputedStyle(el).animationName))
    .toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(
    page
      .getByRole('navigation', { name: 'Main Navigation' })
      .getByRole('link', { name: /Road To/ })
  ).toHaveCount(0);
  const dimensions = await shortcut.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      position: getComputedStyle(element).position,
      radius: getComputedStyle(element).borderRadius,
      width: box.width,
      height: box.height,
    };
  });
  expect(dimensions).toMatchObject({ position: 'fixed', radius: '50%' });
  expect(dimensions.width).toBe(dimensions.height);
  await shortcut.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/road-to-10000$/);
  await expect(shortcut).toHaveAttribute('aria-current', 'page');
  await shortcut.evaluate((el) => (el as HTMLElement).blur());
  await page.mouse.move(0, 0);
  await expect
    .poll(() => shortcut.evaluate((el) => getComputedStyle(el).animationName))
    .toBe('none');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('portfolio-shortcut-visited')
    )
  ).toBe('1');
  await page.reload();
  await expect(shortcut).toBeVisible();
  await expect
    .poll(() => shortcut.evaluate((el) => getComputedStyle(el).animationName))
    .toBe('none');
  await page
    .getByRole('navigation', { name: 'Main Navigation' })
    .getByRole('link', { name: 'Tools', exact: true })
    .click();
  await expect(shortcut).toHaveCount(0);
  for (const route of [
    '/tools/amyloid-inspector',
    '/tools/protein-annotations',
  ]) {
    await page.goto(route);
    await expect(shortcut).toHaveCount(0);
  }
  await page
    .getByRole('navigation', { name: 'Main Navigation' })
    .getByRole('link', { name: 'Contact', exact: true })
    .click();
  await expect(shortcut).toBeVisible();
  await expect
    .poll(() => shortcut.evaluate((el) => getComputedStyle(el).animationName))
    .toBe('none');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('footer').scrollIntoViewIfNeeded();
  const box = await shortcut.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(box.width).toBeGreaterThanOrEqual(44);
  for (const link of await page.locator('footer a').all()) {
    const linkBox = await link.boundingBox();
    expect(
      linkBox.y + linkBox.height <= box.y || linkBox.x + linkBox.width <= box.x
    ).toBe(true);
  }
});
