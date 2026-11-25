import { test, expect } from '@playwright/test';

test('homepage illustration responds to the keyboard and navigation retains content', async ({ page }) => {
  await page.goto('/');
  const slider = page.getByRole('slider', { name: 'Explore a change in shape' });
  const chain = page.locator('svg path[pathLength="1"]');
  const before = await chain.getAttribute('d');
  await slider.focus(); await slider.press('End');
  await expect(slider).toHaveValue('100');
  expect(await chain.getAttribute('d')).not.toBe(before);
  await page.getByRole('link', { name: 'About my work', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pramesh Sharma');
  await expect(page.locator('.routeProgress')).toHaveAttribute('data-loading', 'false');
  await page.goto('/');
  await page.screenshot({ path: '.local/home-motion-desktop.png', fullPage: true, animations: 'disabled' });
});

test('editorial collection offers PDF details and selectable excerpts without school-specific sales copy', async ({ page }) => {
  await page.goto('/resources/phd-essay-bundle');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A life in research,');
  await expect(page.getByText('Three PDF files in one ZIP.', { exact: false })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/CBBG|University of Maryland|DOCX|editable/);
  await expect(page.locator('blockquote')).toContainText('sequence variation');
  await page.getByRole('button', { name: 'Personal statement', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Personal statement', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('blockquote')).toContainText('Through code');
  await page.getByRole('button', { name: 'Statement of purpose', exact: true }).click();
  await expect(page.locator('blockquote')).toContainText('sequence variation');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.local/essay-editorial-desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); });
  await page.screenshot({ path: '.local/essay-editorial-mobile.png', animations: 'disabled' });
  await page.getByRole('heading', { name: 'My PhD Application Essays', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/essay-contents-mobile.png', animations: 'disabled' });
});

test('newsletter pages and APIs are removed and do not trigger background requests', async ({ page, request }) => {
  const newsletterRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/newsletter')) newsletterRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('a[href*="newsletter"], form')).toHaveCount(0);
  expect(newsletterRequests).toEqual([]);
  for (const path of ['/newsletter','/newsletter/admin','/newsletter/confirm','/newsletter/unsubscribe','/api/newsletter/status']) expect((await request.get(path)).status(), path).toBe(404);
  for (const path of ['/api/newsletter/subscribe','/api/newsletter/admin','/api/newsletter/confirm','/api/newsletter/unsubscribe']) expect((await request.post(path, { data: {} })).status(), path).toBe(404);
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/newsletter');
});

test('reduced motion suppresses effects while reading progress and controls remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('slider').focus(); await page.getByRole('slider').press('End');
  await expect(page.getByRole('slider')).toHaveValue('100');
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.goto('/posts/how-i-found-an-nih-postbac-lab');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await expect.poll(() => page.locator('.readingProgress > div').evaluate(element => getComputedStyle(element).transform)).not.toBe('matrix(0, 0, 0, 1, 0, 0)');
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

test('public reading content remains visible with JavaScript disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const path of ['/', '/experience', '/resources/phd-essay-bundle']) {
    await page.goto(path); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main')).not.toHaveCSS('opacity', '0');
  }
  await context.close();
});
