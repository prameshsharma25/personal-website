import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.route('**/pagead/js/adsbygoogle.js?*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' })
  );
});

const first = 'oDGqUMBvrpY',
  second = 'future12345';
const feed = {
  status: 'fresh',
  checkedAt: '2026-11-25T18:00:00Z',
  videos: [
    {
      id: first,
      title: 'Day in the life of a Computational Biologist',
      publishedAt: '2026-04-13T05:33:47Z',
      views: 216,
    },
    {
      id: second,
      title: 'A Future Research Video',
      publishedAt: '2026-11-25T00:00:00Z',
      views: 0,
    },
  ],
};
const report = {
  status: 'available',
  videoId: first,
  startDate: '2026-10-28',
  endDate: '2026-11-24',
  checkedAt: '2026-11-25T18:00:00Z',
  daily: [
    { date: '2026-11-20', views: 5 },
    { date: '2026-11-22', views: 18 },
  ],
  summary: { views: 23, minutesWatched: 20, averageSeconds: 52 },
  searchTerms: [{ term: 'computational biology', views: 8 }],
};
async function mock(page: Page, selectedReport = report) {
  await page.route('**/api/youtube*', (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has('video')) return route.fulfill({ json: feed });
    return route.fulfill({
      json:
        url.searchParams.get('video') === first
          ? selectedReport
          : {
              ...report,
              videoId: second,
              status: 'not_connected',
              daily: null,
              summary: null,
              searchTerms: null,
            },
    });
  });
}
test('Posts shows public videos, future uploads, and measured analytics without loading the player early', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mock(page);
  await page.goto('/posts');
  await page.getByRole('link', { name: 'YouTube Videos & Analytics' }).click();
  const section = page.getByRole('region', {
    name: 'YouTube Videos',
    exact: true,
  });
  await expect(section.getByLabel('Recent Videos')).toHaveValue(first);
  await expect(
    section.getByRole('complementary', { name: 'Latest YouTube Counts' })
  ).toContainText('216');
  await expect(section.locator('iframe')).toHaveCount(0);
  await expect(
    section.getByRole('img', { name: 'Reported daily video views' })
  ).toBeVisible();
  await section.getByText('View Daily Data', { exact: true }).click();
  await expect(section.locator('tbody tr')).toHaveCount(2);
  await expect(section.locator('tbody')).not.toContainText('Nov 21');
  await expect(
    section.getByRole('heading', { name: 'YouTube Search Terms', exact: true })
  ).toBeVisible();
  await expect(section.locator('ol')).toContainText('computational biology');
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.abort()
  );
  await section.getByRole('button', { name: /Play Day in the life/ }).click();
  await expect(section.locator('iframe')).toHaveAttribute(
    'src',
    `https://www.youtube-nocookie.com/embed/${first}?autoplay=1`
  );
  await section.getByLabel('Recent Videos').selectOption(second);
  await expect(
    section.getByRole('heading', {
      name: 'A Future Research Video',
      exact: true,
    })
  ).toBeVisible();
  await expect(section.locator('iframe')).toHaveCount(0);
  await expect(section.getByRole('status')).toContainText(
    'once channel analytics are connected'
  );
  await expect(
    section.getByRole('img', { name: 'Reported daily video views' })
  ).toHaveCount(0);
  await expect(
    section.getByRole('complementary', { name: 'Latest YouTube Counts' })
  ).toContainText('0');
  const request = page.waitForRequest((r) =>
    r.url().includes(`video=${second}&days=90`)
  );
  await section.getByRole('button', { name: '90 Days', exact: true }).click();
  await request;
  await section.getByLabel('Search Topic').fill('protein folding');
  await expect(
    section.getByRole('link', { name: 'Explore On Google Trends' })
  ).toHaveAttribute('href', /gprop=youtube&q=protein%20folding/);
  expect(errors).toEqual([]);
});
test('missing counts and failed reports are not displayed as zero or synthetic trends', async ({
  page,
}) => {
  await page.route('**/api/youtube*', (route) =>
    new URL(route.request().url()).searchParams.has('video')
      ? route.fulfill({ status: 503, json: { error: 'Unavailable' } })
      : route.fulfill({
          json: {
            ...feed,
            status: 'unavailable',
            checkedAt: null,
            videos: [{ ...feed.videos[0], views: null }],
          },
        })
  );
  await page.goto('/posts#videos');
  const section = page.getByRole('region', {
    name: 'YouTube Videos',
    exact: true,
  });
  await expect(
    section.getByRole('complementary', { name: 'Latest YouTube Counts' })
  ).toContainText('Not Available');
  await expect(section.getByRole('status')).toContainText(
    'temporarily unavailable'
  );
  await expect(
    section.getByRole('img', { name: 'Reported daily video views' })
  ).toHaveCount(0);
  await expect(
    section.getByRole('link', { name: 'Watch On YouTube' })
  ).toHaveAttribute('href', `https://www.youtube.com/watch?v=${first}`);
});
test('mobile video analytics remain readable with reduced motion', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mock(page);
  await page.goto('/posts#videos');
  const section = page.getByRole('region', {
    name: 'YouTube Videos',
    exact: true,
  });
  await expect(
    section.getByRole('img', { name: 'Reported daily video views' })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await section.screenshot({ path: info.outputPath('youtube-mobile.png') });
});

test('views chart supports hover, pinning, keyboard dates, cumulative views, peak selection, and CSV export', async ({
  page,
}, info) => {
  await mock(page);
  await page.goto('/posts#videos');
  const details = page.getByLabel('Selected Day Details');
  const firstBar = page.locator('svg rect[data-date="2026-11-20"]');
  const peakBar = page.locator('svg rect[data-date="2026-11-22"]');
  await firstBar.hover();
  await expect(details).toContainText('Nov 20, 2026');
  await expect(details.locator('strong')).toHaveText('5');
  await firstBar.click();
  await peakBar.hover();
  await expect(details).toContainText('Pinned Day');
  await expect(details).toContainText('Nov 20, 2026');
  await page.getByRole('button', { name: 'Unpin Day', exact: true }).click();
  await peakBar.hover();
  await expect(details.locator('strong')).toHaveText('18');

  const slider = page.getByRole('slider', { name: 'Explore Chart Days' });
  await slider.focus();
  await slider.press('ArrowLeft');
  await expect(slider).toHaveAttribute(
    'aria-valuetext',
    'Nov 21, 2026: Not Reported'
  );
  await expect(details.locator('strong')).toHaveText('Not Reported');
  await slider.press('Home');
  await expect(details).toContainText('Oct 28, 2026');
  await slider.press('End');
  await expect(details).toContainText('Nov 24, 2026');
  await slider.press('ArrowLeft');
  await slider.press('ArrowLeft');

  await page.getByRole('button', { name: 'Cumulative', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Cumulative reported video views' })
  ).toBeVisible();
  await expect(details.locator('strong')).toHaveText('23');
  await expect(slider).toHaveAttribute(
    'aria-valuetext',
    'Nov 22, 2026: 23 Cumulative Reported Views'
  );
  const line = await page
    .getByRole('img', { name: 'Cumulative reported video views' })
    .locator('path')
    .getAttribute('d');
  expect(line?.match(/M /g)).toHaveLength(2);
  await page.getByRole('button', { name: 'Daily', exact: true }).click();
  await page.getByRole('button', { name: /Peak Day/ }).click();
  await expect(details.locator('strong')).toHaveText('18');

  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe(
    `youtube-views-${first}-2026-10-28-to-2026-11-24.csv`
  );
  const destination = info.outputPath('views.csv');
  await download.saveAs(destination);
  const csv = await readFile(destination, 'utf8');
  expect(csv).toContain(`"${first}","2026-11-20","5","5"`);
  expect(csv).toContain(`"${first}","2026-11-22","18","23"`);
  expect(csv).not.toContain('2026-11-21');
  expect(csv.trim().split('\r\n')).toHaveLength(3);
  await page
    .getByRole('region', { name: 'YouTube Videos', exact: true })
    .screenshot({ path: info.outputPath('youtube-interactive-desktop.png') });
});

test('chart resets when the video or date range changes without requesting data for local controls', async ({
  page,
}) => {
  let analyticsRequests = 0;
  await page.route('**/api/youtube*', (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has('video')) return route.fulfill({ json: feed });
    analyticsRequests++;
    const next = url.searchParams.get('video') === second;
    const long = url.searchParams.get('days') === '90';
    return route.fulfill({
      json: {
        ...report,
        videoId: next ? second : first,
        startDate: long ? '2026-08-27' : report.startDate,
        daily: next ? [{ date: '2026-11-23', views: 0 }] : report.daily,
      },
    });
  });
  await page.goto('/posts#videos');
  await expect(page.getByLabel('Selected Day Details')).toContainText(
    'Nov 22, 2026'
  );
  const before = analyticsRequests;
  await page.getByRole('button', { name: 'Cumulative', exact: true }).click();
  await page.getByRole('button', { name: /Peak Day/ }).click();
  expect(analyticsRequests).toBe(before);
  await page.getByRole('button', { name: '90 Days', exact: true }).click();
  await expect(
    page.getByRole('slider', { name: 'Explore Chart Days' })
  ).toHaveAttribute('max', '89');
  await expect(
    page.getByRole('button', { name: 'Daily', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Unpin Day', exact: true })
  ).toHaveCount(0);
  await page.getByLabel('Recent Videos').selectOption(second);
  await expect(page.getByLabel('Selected Day Details')).toContainText(
    'Nov 23, 2026'
  );
  await expect(
    page.getByLabel('Selected Day Details').locator('strong')
  ).toHaveText('0');
  await page.getByRole('button', { name: /Peak Day/ }).click();
  await expect(page.getByLabel('Selected Day Details')).toContainText(
    'Pinned Day'
  );
  const chart = page.getByRole('img', { name: 'Reported daily video views' });
  expect(await chart.innerHTML()).not.toMatch(/NaN|Infinity/);
});

test('touch selects and pins days while the mobile chart and controls stay within the viewport', async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await page.route('**/pagead/js/adsbygoogle.js?*', (route) =>
      route.fulfill({ body: '' })
    );
    await mock(page);
    await page.goto(
      (process.env.TEST_BASE_URL || 'http://127.0.0.1:3817') + '/posts#videos'
    );
    await page.locator('svg rect[data-date="2026-11-20"]').tap();
    const details = page.getByLabel('Selected Day Details');
    await expect(details).toContainText('Nov 20, 2026');
    await expect(details).toContainText('Pinned Day');
    await page.getByRole('button', { name: 'Cumulative', exact: true }).tap();
    await expect(details.locator('strong')).toHaveText('5');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await page
      .getByRole('region', { name: 'YouTube Videos', exact: true })
      .screenshot({ path: info.outputPath('youtube-interactive-touch.png') });
  } finally {
    await context.close();
  }
});
