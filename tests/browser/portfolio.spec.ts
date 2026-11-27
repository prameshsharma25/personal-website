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
      { symbol: 'TEST', name: 'Test Holding', percent: 40 },
      { symbol: 'ABC', name: 'Another Test Holding', percent: 20 },
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
  ).toHaveCount(0);
  await expect(
    page.getByText('Link Coming Soon', { exact: true })
  ).toBeVisible();
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
      .getByRole('link', { name: 'Road To $10K' })
  ).toHaveAttribute('aria-current', 'page');
  await context.close();
});
