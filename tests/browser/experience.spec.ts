import { test, expect } from '@playwright/test';

test('RfaH viewer switches experimental states and offers keyboard controls', async ({ page }) => {
  const externalFonts: string[] = [];
  let releaseStructure!: () => void;
  const structureGate = new Promise<void>(resolve => { releaseStructure = resolve; });
  await page.route('**/2LCL-CTD.pdb', async route => { await structureGate; await route.continue(); });
  page.on('request', request => { if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) externalFonts.push(request.url()); });
  await page.goto('/');
  const figure = page.locator('figure[data-fold]');
  await expect(figure).toHaveAttribute('data-viewer', 'ready', { timeout: 20000 });
  await expect(figure.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Pause Rotation', exact: true }).click();
  await expect(figure).toHaveAttribute('data-spinning', 'false');
  await page.getByRole('button', { name: /β-Barrel State/ }).focus(); await page.keyboard.press('Enter');
  await expect(figure).toHaveAttribute('data-fold', 'beta');
  try {
    await expect(figure).toHaveAttribute('data-viewer', 'loading');
    await expect(figure.locator('canvas')).not.toBeVisible();
    await expect(figure.locator('svg')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom In' })).toBeDisabled();
  } finally { releaseStructure(); }
  await expect(figure).toHaveAttribute('data-viewer', 'ready');
  await expect(figure).toHaveAttribute('data-rendered-fold', 'beta');
  await expect(figure).toContainText('2LCL / CHAIN A');
  await page.getByRole('button', { name: 'Rotate Structure Left' }).click();
  await page.getByRole('button', { name: 'Zoom In' }).click();
  await page.getByRole('button', { name: 'Reset View', exact: true }).click();
  await page.getByText('Structures & Sources', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download The Displayed Coordinates' })).toHaveAttribute('href', '/structures/rfah/2LCL-CTD.pdb');
  expect(externalFonts).toEqual([]);
  await page.getByRole('link', { name: 'About My Work', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pramesh Sharma');
  await expect(page.locator('.routeProgress')).toHaveAttribute('data-loading', 'false');
});

test('local fonts render and pointer tilt responds to reduced-motion changes', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family));
  expect(fonts).toEqual(expect.arrayContaining(['bodyFont', 'displayFont']));
  const card = page.locator('[data-tilt]').first();
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await card.hover({ position: { x: 30, y: 30 } });
  await expect.poll(() => card.evaluate(element => { const matrix = new DOMMatrix(getComputedStyle(element).transform); return Math.abs(matrix.m13) + Math.abs(matrix.m23); })).toBeGreaterThan(.01);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => card.evaluate(element => element.style.getPropertyValue('--tilt-x'))).toBe('');
  const rotation = await card.evaluate(element => { const matrix = new DOMMatrix(getComputedStyle(element).transform); return Math.abs(matrix.m13) + Math.abs(matrix.m23); });
  expect(rotation).toBe(0);
});

test('editorial collection offers PDF details and selectable excerpts without school-specific sales copy', async ({ page }) => {
  await page.goto('/resources/phd-essay-bundle');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A life in research,');
  await expect(page.getByText('Three PDF files in one ZIP.', { exact: false })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/CBBG|University of Maryland|DOCX|editable/);
  await expect(page.locator('blockquote')).toContainText('sequence variation');
  await page.getByRole('button', { name: 'Personal Statement', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Personal Statement', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('blockquote')).toContainText('Through code');
  await page.getByRole('button', { name: 'Statement Of Purpose', exact: true }).click();
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
  await page.getByRole('button', { name: /β-Barrel State/ }).click();
  await expect(page.locator('figure[data-fold]')).toHaveAttribute('data-fold', 'beta');
  await expect(page.locator('figure[data-fold]')).toHaveAttribute('data-spinning', 'false');
  await expect(page.getByRole('button', { name: 'Rotation Paused', exact: true })).toBeDisabled();
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
  for (const path of ['/', '/experience', '/posts', '/resources', '/mentorship', '/books', '/contact', '/resources/phd-essay-bundle']) {
    await page.goto(path); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main')).not.toHaveCSS('opacity', '0');
    if (path === '/mentorship') await expect(page.getByRole('link', { name: 'Open Calendly In A New Tab' })).toHaveAttribute('href', 'https://calendly.com/prameshsharma25');
    if (path === '/books') await expect(page.getByRole('heading', { name: 'Snow Crash', exact: true })).toBeVisible();
  }
  await context.close();
});

test('actual-coordinate fallback remains usable when the viewer cannot load', async ({ page }) => {
  await page.route('**/vendor/3dmol/**', route => route.abort());
  await page.goto('/');
  const figure = page.locator('figure[data-fold]');
  await expect(figure).toHaveAttribute('data-viewer', 'fallback');
  await expect(figure.locator('svg')).toBeVisible();
  const before = await figure.locator('svg path').getAttribute('d');
  await page.getByRole('button', { name: /β-Barrel State/ }).click();
  expect(await figure.locator('svg path').getAttribute('d')).not.toBe(before);
  await expect(figure).toContainText('2LCL / CHAIN A');
});
