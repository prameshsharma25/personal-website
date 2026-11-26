import { test, expect, type Page } from '@playwright/test';

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
async function mock(page: Page) {
  await page.route('**/api/youtube*', (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has('video')) return route.fulfill({ json: feed });
    return route.fulfill({
      json:
        url.searchParams.get('video') === first
          ? report
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
