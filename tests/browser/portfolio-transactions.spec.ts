import { test, expect } from '@playwright/test';

const checkedAt = new Date().toISOString();
const portfolio = {
  status: 'available',
  mode: 'synced',
  stale: false,
  checkedAt,
  snapshot: {
    total: 2500,
    currency: 'USD',
    balanceAsOf: checkedAt,
    holdingsAsOf: checkedAt,
    incompleteHoldings: false,
    holdings: [
      { symbol: 'TEST', name: 'Test Holding', percent: 40, marketValue: 1000 },
      { symbol: 'ABC', name: 'Another Holding', percent: 20, marketValue: 500 },
    ],
  },
};
const rows = Array.from({ length: 12 }, (_, i) => ({
  id: `row-${i}`,
  date: '2026-11-26',
  symbol: i % 2 ? 'ABC' : 'TEST',
  name: i % 2 ? 'Another Holding' : 'Test Holding',
  type: i % 3 ? 'BUY' : 'DIVIDEND',
  amount: i % 3 ? -100.25 : 2.5,
  currency: 'USD',
}));
const activity = {
  status: 'available',
  transactions: rows,
  nextOffset: 50,
  syncedThrough: '2026-11-26',
  syncComplete: true,
  checkedAt,
  stale: false,
  omitted: false,
};

test('transactions support filters, paging, holding selection and outage recovery without duplicate rows', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({ json: portfolio })
  );
  await page.route('**/api/portfolio-history?*', (route) =>
    route.fulfill({ json: { status: 'disabled', symbol: 'TEST', points: [] } })
  );
  let status = 'available';
  await page.route('**/api/portfolio-transactions?*', (route) => {
    if (status === 'unavailable')
      return route.fulfill({ status: 503, body: 'Unavailable' });
    const offset = new URL(route.request().url()).searchParams.get('offset');
    return route.fulfill({
      json:
        status === 'disabled'
          ? { ...activity, status, transactions: [] }
          : offset === '0'
            ? activity
            : {
                ...activity,
                nextOffset: null,
                transactions: [
                  rows[11],
                  {
                    ...rows[0],
                    id: 'older',
                    date: '2026-11-25',
                    type: 'SELL',
                    amount: 225,
                  },
                ],
              },
    });
  });
  await page.goto('/road-to-10000');
  const feed = page.getByRole('region', {
    name: 'Recent Transactions',
    exact: true,
  });
  await expect(feed.getByRole('listitem')).toHaveCount(10);
  await expect(feed.getByText(/History Synced Through/)).toContainText(
    'Nov 26, 2026'
  );
  await feed.getByRole('button', { name: 'Show More Transactions' }).click();
  await expect(feed.getByRole('listitem')).toHaveCount(12);
  await feed.getByRole('button', { name: 'Load Older Activity' }).click();
  await expect(feed.getByRole('listitem')).toHaveCount(13);
  await expect(
    feed.getByRole('button', { name: 'Load Older Activity' })
  ).toHaveCount(0);
  await feed.getByLabel('Filter Transactions By Activity').selectOption('SELL');
  await expect(feed.getByRole('listitem')).toHaveCount(1);
  await expect(feed.getByRole('listitem')).toContainText('+$225.00');
  await feed.getByRole('button', { name: 'Clear Filters' }).click();
  await page.getByRole('button', { name: /TEST 40.00% Test Holding/ }).click();
  await expect(feed.getByLabel('Filter Transactions By Holding')).toHaveValue(
    'TEST'
  );
  await expect(feed.getByRole('listitem')).toHaveCount(7);
  status = 'unavailable';
  await feed.getByRole('button', { name: 'Check For New Activity' }).click();
  await expect(feed.getByRole('status')).toContainText(
    'already loaded remains visible'
  );
  await expect(feed.getByRole('listitem')).toHaveCount(7);
  status = 'disabled';
  await feed.getByRole('button', { name: 'Check For New Activity' }).click();
  await expect(feed).toHaveCount(0);
  await expect(page.locator('[data-portfolio-value]')).toHaveText('$2,500.00');
  expect(errors).toEqual([]);
});

test('transaction feed fits mobile, bounds scrolling, and distinguishes unknown amounts from zero', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({ json: portfolio })
  );
  await page.route('**/api/portfolio-transactions?*', (route) =>
    route.fulfill({
      json: {
        ...activity,
        nextOffset: null,
        transactions: [{ ...rows[0], amount: null }, ...rows.slice(1)],
      },
    })
  );
  await page.goto('/road-to-10000');
  const feed = page.getByRole('region', {
    name: 'Recent Transactions',
    exact: true,
  });
  await expect(feed.getByText('Not Available', { exact: true })).toBeVisible();
  const list = feed.getByRole('region', { name: 'Transaction List' });
  await list.focus();
  await page.keyboard.press('End');
  expect(
    await list.evaluate(
      (el) => el.scrollHeight > el.clientHeight && el.clientHeight <= 450
    )
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await feed.getByLabel('Filter Transactions By Activity').selectOption('REI');
  await expect(
    feed.getByText('No loaded transactions match these filters.')
  ).toBeVisible();
  await expect(feed.getByText('Not Available', { exact: true })).toHaveCount(0);
});

test('initial history failure is recoverable and partial synchronization is labeled', async ({
  page,
}) => {
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({ json: portfolio })
  );
  let failed = true;
  await page.route('**/api/portfolio-transactions?*', (route) =>
    route.fulfill({
      json: {
        ...activity,
        status: failed ? 'unavailable' : 'available',
        transactions: [],
        nextOffset: null,
        syncedThrough: null,
        syncComplete: false,
        stale: true,
      },
    })
  );
  await page.goto('/road-to-10000');
  const feed = page.getByRole('region', {
    name: 'Recent Transactions',
    exact: true,
  });
  await expect(feed.getByText(/Please try again later/)).toBeVisible();
  await expect(feed.getByText(/No eligible transactions/)).toHaveCount(0);
  failed = false;
  await feed.getByRole('button', { name: 'Check For New Activity' }).click();
  await expect(
    feed.getByText(/initial history sync is still in progress/)
  ).toBeVisible();
  await expect(
    feed.getByText(
      'No eligible transactions were returned in this history page.'
    )
  ).toBeVisible();
  await expect(feed.getByText('History Sync Date Not Reported')).toBeVisible();
});
