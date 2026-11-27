import { test, expect } from '@playwright/test';

test('About sections follow the requested order and include the NASA project', async ({
  page,
}) => {
  await page.goto('/experience');
  const nav = page.getByRole('navigation', { name: 'About Page Sections' });
  await expect(nav.getByRole('link')).toHaveText([
    'Background',
    'Research',
    'Projects',
    'Papers',
  ]);
  expect(
    await page
      .locator('main > section[id]')
      .evaluateAll((elements) => elements.map((element) => element.id))
  ).toEqual(['background', 'research', 'projects', 'publications']);
  const ammper = page.locator('#project-ammper');
  await expect(ammper.getByRole('heading', { level: 3 })).toHaveText(
    'AMMPER: Microbial Life Under Radiation'
  );
  await expect(
    ammper.getByRole('link', { name: 'Explore AMMPER At NASA' })
  ).toHaveAttribute('href', 'https://github.com/nasa/AMMPER');
  await expect(ammper).toContainText('NASA Research');
  await expect(ammper).not.toContainText('Ongoing');
});

test('real molecular cartoons load, pause, and release their canvases between steps', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/experience');
  const bri = page.locator('#project-bri');
  await bri.getByRole('button', { name: /Encode Geometry/ }).click();
  await bri.locator('figure').scrollIntoViewIfNeeded();
  const molecule = bri.locator('[data-molecule="rfahAlpha"]');
  await expect(molecule).toHaveAttribute('data-viewer', 'ready', {
    timeout: 20000,
  });
  await expect(molecule.locator('canvas')).toBeVisible();
  await expect(molecule).toHaveAttribute('data-spinning', 'false');
  await bri.getByRole('button', { name: /^Play / }).click();
  await expect(molecule).toHaveAttribute('data-spinning', 'true');
  await bri.getByRole('button', { name: /^Pause / }).click();
  await expect(molecule).toHaveAttribute('data-spinning', 'false');
  await bri.screenshot({ path: '.local/realistic-bri-desktop.png' });
  await bri.getByRole('button', { name: /Compare Models/ }).click();
  await expect(molecule.locator('canvas')).toHaveCount(0);

  const caat = page.locator('#project-caat');
  await caat.getByRole('button', { name: /Compare Folds/ }).click();
  await caat.locator('figure').scrollIntoViewIfNeeded();
  await expect(caat.locator('[data-viewer="ready"]')).toHaveCount(2, {
    timeout: 20000,
  });
  await caat.screenshot({ path: '.local/realistic-caat-desktop.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await caat.getByRole('button', { name: /^Play / }).click();
  await expect(caat.locator('[data-spinning="true"]')).toHaveCount(0);
  await caat.getByRole('button', { name: /Read Attention/ }).click();
  await expect(caat.locator('canvas')).toHaveCount(0);

  const amyloid = page.locator('#project-amyloid');
  await amyloid.getByRole('button', { name: /Assess Structure/ }).click();
  await amyloid.locator('figure').scrollIntoViewIfNeeded();
  await expect(amyloid.locator('[data-molecule="amyloid0"]')).toHaveAttribute(
    'data-viewer',
    'ready',
    { timeout: 20000 }
  );
  await amyloid.screenshot({ path: '.local/realistic-amyloid-desktop.png' });
  await amyloid.getByRole('button', { name: /Collect Predictions/ }).click();
  await amyloid.screenshot({ path: '.local/realistic-amyloid-pool.png' });
  await page
    .locator('#project-ammper')
    .screenshot({ path: '.local/ammper-desktop.png' });
  expect(errors).toEqual([]);
});

test('shaded molecular posters survive viewer failure and remain visible without JavaScript', async ({
  browser,
  page,
  baseURL,
}) => {
  await page.route('**/vendor/3dmol/**', (route) => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/experience');
  const bri = page.locator('#project-bri');
  await bri.locator('figure').scrollIntoViewIfNeeded();
  const molecule = bri.locator('[data-molecule="rfahAlpha"]');
  await expect(molecule).toHaveAttribute('data-viewer', 'poster');
  await expect(molecule.locator('img')).toBeVisible();
  expect(
    await molecule
      .locator('img')
      .evaluate((image) => (image as HTMLImageElement).naturalWidth)
  ).toBeGreaterThan(0);
  await expect(molecule.locator('canvas')).toHaveCount(0);
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  try {
    const nojs = await context.newPage();
    await nojs.goto('/experience#projects');
    const poster = nojs.locator('#project-bri [data-molecule] img');
    await expect(poster).toBeVisible();
    expect(
      await poster.evaluate((image) => (image as HTMLImageElement).naturalWidth)
    ).toBeGreaterThan(0);
    await nojs
      .locator('#project-ammper')
      .screenshot({ path: '.local/ammper-nojs-mobile.png' });
  } finally {
    await context.close();
  }
});
