import { test, expect } from '@playwright/test';

test('project walkthroughs hydrate cleanly and every step works with a keyboard', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /hydrat|server rendered HTML|Minified React error/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.goto('/experience');
  await page
    .getByRole('navigation', { name: 'About Page Sections' })
    .getByRole('link', { name: 'Projects', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Projects', exact: true })
  ).toBeVisible();
  const cards = page.locator('article[data-project]');
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all()) {
    const steps = card
      .getByRole('list', { name: /Steps$/ })
      .getByRole('button');
    for (let i = 0; i < 4; i++) {
      await steps.nth(i).focus();
      await page.keyboard.press('Enter');
      await expect(steps.nth(i)).toHaveAttribute('aria-pressed', 'true');
      await expect(card).toHaveAttribute('data-step', String(i));
      await expect(card).toHaveAttribute('data-running', 'false');
      const label = (await steps.nth(i).innerText())
        .replace(/^0\d\s*/, '')
        .replace('↗', '')
        .trim();
      await expect(card.getByRole('img')).toHaveAccessibleName(
        new RegExp(label)
      );
      await expect(card.getByRole('img')).toHaveAttribute(
        'aria-describedby',
        /description$/
      );
    }
  }
  await expect(page.locator('#project-caat')).toContainText(
    'they are not the outcome of the mutations'
  );
  await expect(page.locator('#project-amyloid')).toContainText(
    'does not establish that a structure is correct'
  );
  await expect(
    page.getByRole('link', { name: 'Explore CAAT' })
  ).toHaveAttribute('href', 'https://github.com/prameshsharma25/CAAT');
  await expect(
    page.getByRole('link', { name: 'Explore Amyloid Candidates' })
  ).toHaveAttribute('href', 'https://github.com/DevlinaC/Amyloid_Candidates');
  await expect(
    page.locator('a[href*="prameshsharma25/bri-cluster"]')
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .locator('#project-bri')
      .getByRole('button', { name: /Encode Geometry/ })
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test('autoplay advances only in view and obeys pause, tab visibility, and motion preferences', async ({
  page,
}) => {
  await page.goto('/experience');
  const card = page.locator('#project-bri');
  await expect(card.getByRole('button', { name: /^Pause / })).toBeVisible();
  await expect(card).toHaveAttribute('data-running', 'false');
  await card.locator('figure').scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-running', 'true');
  await expect(card).toHaveAttribute('data-step', '1', { timeout: 10000 });
  await card.getByRole('button', { name: /^Pause / }).click();
  await expect(card).toHaveAttribute('data-running', 'false');
  const pausedStep = await card.getAttribute('data-step');
  await expect
    .poll(() =>
      card.evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === 'running').length
      )
    )
    .toBe(0);
  await page.clock.install();
  await page.clock.runFor(14000);
  await expect(card).toHaveAttribute('data-step', pausedStep!);
  expect(
    await card.evaluate(
      (element) =>
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === 'running').length
    )
  ).toBe(0);
  await card.getByRole('button', { name: /^Play / }).click();
  await expect(card).toHaveAttribute('data-running', 'true');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(card).toHaveAttribute('data-running', 'false');
  await page.clock.runFor(14000);
  await expect(card).toHaveAttribute('data-step', pausedStep!);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(card).toHaveAttribute('data-running', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(card).toHaveAttribute('data-running', 'false');
  await expect(card.getByRole('button', { name: /^Play / })).toBeVisible();
  await card.getByRole('button', { name: /Choose Representatives/ }).click();
  await expect(card).toHaveAttribute('data-step', '3');
});

test('reduced-motion walkthroughs stay readable on mobile and desktop without overflow', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/experience');
  const cards = page.locator('article[data-project]');
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute('data-running', 'false');
    await card.screenshot({
      path: `.local/project-${await card.getAttribute('data-project')}-desktop.png`,
    });
  }
  expect(
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === 'running').length
    )
  ).toBe(0);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const card of await cards.all()) {
      await card.getByRole('button', { name: /04/ }).click();
      await expect(card).toHaveAttribute('data-step', '3');
      await expect(card.getByRole('img')).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('#project-caat')
    .screenshot({ path: '.local/project-caat-mobile.png' });
});

test('project descriptions, source links, and all workflow explanations are available without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto('/experience#projects');
    for (const card of await page.locator('article[data-project]').all()) {
      await expect(card.getByRole('heading', { level: 3 })).toBeVisible();
      await expect(card.getByRole('img')).toBeVisible();
      await expect(card.locator('noscript li')).toHaveCount(3);
      await expect(card.getByRole('link')).toBeVisible();
      await expect(card.getByRole('button').first()).toBeDisabled();
    }
    await expect(
      page.locator('#project-amyloid noscript li').last()
    ).toBeVisible();
    await expect(
      page.locator('#project-amyloid noscript li').last()
    ).toContainText('does not establish that a structure is correct');
  } finally {
    await context.close();
  }
});
