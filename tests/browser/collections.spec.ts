import { test, expect } from '@playwright/test';

test('essay search combines with category filters and resets cleanly', async ({
  page,
}) => {
  await page.goto('/posts');
  await page
    .getByRole('button', { name: 'Research Careers', exact: true })
    .click();
  await page.getByLabel('Search Essays').fill('how i found');
  await expect(
    page.getByRole('heading', { name: /How I Found an NIH/ })
  ).toBeVisible();
  await expect(page.locator('main article')).toHaveCount(1);
  await page.getByLabel('Search Essays').fill('unmatched-search-98765');
  await expect(
    page.getByRole('heading', { name: 'No Matching Essays' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset Filters' }).click();
  await expect(page.getByLabel('Search Essays')).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'All Posts', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: /doppelg/ })).toBeVisible();
});

test('resource goals show relevant guides and keep product links available', async ({
  page,
}) => {
  await page.goto('/resources');
  const guides = page.getByRole('region', { name: 'Start With A Guide' });
  await guides.getByRole('button', { name: 'Write An Application' }).click();
  await expect(guides.getByRole('status')).toHaveText('2 Guides');
  await expect(
    guides.getByRole('link', { name: /Prepare For PhD Applications/ })
  ).toHaveAttribute('href', '/mentorship/phd-toolkit');
  await expect(
    guides.getByRole('link', { name: /How I Found My NIH Lab/ })
  ).toHaveCount(0);
  await guides.getByRole('button', { name: 'Find A Lab' }).click();
  await expect(guides.getByRole('status')).toHaveText('4 Guides');
  await guides.getByRole('button', { name: 'All Guides' }).click();
  await expect(guides.getByRole('status')).toHaveText('6 Guides');
  await expect(
    page.getByRole('link', { name: 'Get The Free Tracker' })
  ).toHaveAttribute('href', '/resources/lab-search-tracker');
  await expect(
    page.getByRole('link', { name: 'Preview The Bundle' })
  ).toHaveAttribute('href', '/resources/phd-essay-bundle');
});

test('book shelves, search, and descriptions work with keyboard controls', async ({
  page,
}) => {
  await page.goto('/books');
  const shelf = page.getByRole('group', { name: 'Filter Books By Status' });
  await shelf.getByRole('button', { name: 'Reading', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main article')).toHaveCount(1);
  await expect(
    page
      .locator('main article')
      .getByRole('heading', { name: 'A City on Mars' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Snow Crash', exact: true })
  ).toHaveCount(0);
  await page.getByText('About This Book', { exact: false }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('details')).toHaveAttribute('open', '');
  await expect(page.locator('details p')).toBeVisible();
  await page.getByLabel('Search Books').fill('unknown-book-98765');
  await expect(
    page.getByRole('heading', { name: 'No Matching Books' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear Search' }).click();
  await shelf.getByRole('button', { name: 'Completed', exact: true }).click();
  await page.getByLabel('Search Books').fill('Neal Stephenson');
  await expect(page.locator('main article')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Snow Crash', exact: true })
  ).toBeVisible();
});

test('contact form prevents repeat submission and preserves a failed draft', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const payloads: unknown[] = [];
  await page.route('**/api/sendMessage', async (route) => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) {
      await gate;
      await route.fulfill({
        status: 503,
        json: { error: 'Preview delivery failed.' },
      });
    } else
      await route.fulfill({ json: { success: 'Message sent successfully!' } });
  });
  await page.goto('/contact');
  await page.getByLabel('Name', { exact: true }).fill('Preview Visitor');
  await page
    .getByLabel('Email', { exact: true })
    .fill('preview@example.invalid');
  await page
    .getByLabel('Message', { exact: true })
    .fill('Checking the local form preview.');
  await page.getByRole('button', { name: 'Send Message' }).click();
  try {
    await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    await expect(page.getByLabel('Message', { exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.locator('main').getByRole('alert')).toHaveText('Preview delivery failed.');
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
    'Checking the local form preview.'
  );
  await page.getByRole('button', { name: 'Send Message' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Message sent successfully!'
  );
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('');
  expect(payloads).toEqual(
    Array(2).fill({
      name: 'Preview Visitor',
      email: 'preview@example.invalid',
      message: 'Checking the local form preview.',
    })
  );
});

test('every navigation tab remains readable on small screens with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  for (const name of [
    'About',
    'Posts',
    'Resources',
    'Mentorship',
    'Books',
    'Contact',
    'Home',
  ]) {
    const link = page
      .getByRole('navigation', { name: 'Main Navigation' })
      .getByRole('link', { name, exact: true });
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('main h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(321);
    expect(
      await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((animation) => animation.playState === 'running').length
      )
    ).toBe(0);
  }
});
