import { test, expect } from '@playwright/test';

test('mentorship paths update the discussion plan and calendar loads only when opened', async ({
  page,
}) => {
  const calendarRequests: string[] = [];
  await page.route('https://calendly.com/**', async (route) => {
    calendarRequests.push(route.request().url());
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Scheduling Preview</title><p>Calendar preview</p>',
    });
  });
  await page.goto('/mentorship');
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(calendarRequests).toEqual([]);
  const choices = page.getByRole('group', { name: 'Choose A Mentorship Path' });
  const panel = page.locator('#mentorship-path-details');
  await choices.getByRole('button', { name: /Prepare An Application/ }).focus();
  await page.keyboard.press('Enter');
  await expect(
    choices.getByRole('button', { name: /Prepare An Application/ })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    panel.getByRole('heading', { name: 'Find The Thread In Your Experience' })
  ).toBeVisible();
  await expect(panel).toContainText(
    'Review your CV, statement of purpose, or personal statement.'
  );
  await expect(panel.getByRole('link')).toHaveAttribute(
    'href',
    '/mentorship/phd-toolkit'
  );
  await choices.getByRole('button', { name: /Move Into Research/ }).click();
  await expect(panel.getByRole('link')).toHaveAttribute(
    'href',
    '/posts/quitting-100k-software-job'
  );
  await expect(page.locator('#book strong')).toHaveText('Move Into Research');
  await expect(choices.locator('button[aria-pressed=true]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show Available Times' }).click();
  await expect(
    page.getByRole('button', { name: 'Hide Calendar' })
  ).toHaveAttribute('aria-expanded', 'true');
  await page.getByTitle('Calendly Scheduling').scrollIntoViewIfNeeded();
  await expect(page.getByTitle('Calendly Scheduling')).toBeVisible();
  await expect.poll(() => calendarRequests.length).toBe(1);
  await page.getByRole('button', { name: 'Hide Calendar' }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Show Available Times' })
  ).toBeFocused();
  await expect(
    page.getByRole('link', { name: 'Open Calendly In A New Tab' })
  ).toHaveAttribute('href', 'https://calendly.com/prameshsharma25');
});

test('mentorship is usable on narrow screens and with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/mentorship');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const label of [
      'Prepare An Application',
      'Move Into Research',
      'Find A Research Lab',
    ]) {
      const button = page
        .getByRole('group', { name: 'Choose A Mentorship Path' })
        .getByRole('button', { name: new RegExp(label) });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      const bounds = await button.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((animation) => animation.playState === 'running').length
      )
    ).toBe(0);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.local/mentorship-desktop.png' });
  await page
    .locator('#paths')
    .screenshot({ path: '.local/mentorship-paths-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.local/mentorship-mobile.png' });
  await page
    .locator('#paths')
    .screenshot({ path: '.local/mentorship-paths-mobile.png' });
});
