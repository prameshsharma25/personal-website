import { test, expect } from '@playwright/test';
test('first Dr. Lauren Porter mention links to NIH and Tools has a dedicated route', async ({
  page,
}) => {
  await page.goto('/experience');
  await expect(
    page.locator('main a[href="https://irp.nih.gov/pi/lauren-porter"]').first()
  ).toHaveText('Dr. Lauren Porter');
  await page
    .getByRole('navigation', { name: 'Main Navigation' })
    .getByRole('link', { name: 'Tools', exact: true })
    .click();
  await expect(page).toHaveURL(/\/tools$/);
  await page.getByRole('link', { name: 'Open Analysis', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Amyloid Structure Analysis'
  );
  await expect(
    page
      .getByRole('group', { name: 'Choose An Analysis Mode' })
      .getByRole('button')
  ).toHaveText(['On My Device', 'Server Analysis']);
  await expect(
    page
      .getByRole('navigation', { name: 'Main Navigation' })
      .getByRole('link', { name: 'Tools', exact: true })
  ).toHaveAttribute('aria-current', 'page');
});
test('loads calculated warning, renders actual structure, exports, and clears', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tools/amyloid-inspector');
  await page.getByRole('button', { name: '6QJH / Geometry Warning' }).click();
  await expect(
    page.getByRole('heading', { name: 'Geometry Not Directly Assessable' })
  ).toBeVisible();
  await expect(page.locator('[data-viewer="ready"]')).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.getByText('SHA-256 Matched', { exact: true })
  ).toBeVisible();
  await page
    .locator('summary')
    .filter({ hasText: /^Direct Geometry Not Assessable$/ })
    .click();
  await expect(
    page.getByText('The package could not directly assess repeat geometry.')
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Representation', exact: true })
    .selectOption('Sticks');
  await page.getByRole('button', { name: 'Rotate Left', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Review' }).click();
  expect((await download).suggestedFilename()).toBe('amyloid-review.json');
  await page.getByRole('button', { name: 'Clear Files' }).click();
  await expect(page.locator('[data-viewer]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('works at mobile width with reduced motion and a failed renderer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/vendor/3dmol/**', (route) => route.abort());
  await page.goto('/tools/amyloid-inspector');
  await page.getByRole('button', { name: '6QJH / Geometry Warning' }).click();
  await expect(
    page.getByText('3D rendering is unavailable', { exact: false })
  ).toBeVisible();
  await page
    .locator('summary')
    .filter({ hasText: /^Direct Geometry Not Assessable$/ })
    .click();
  await expect(
    page.getByText('The package could not directly assess repeat geometry.')
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Export Review' })
  ).toBeEnabled();
});
test('keeps instructions, metadata, and routes available without JavaScript', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(
    `${process.env.TEST_BASE_URL || 'http://127.0.0.1:3817'}/tools/amyloid-inspector`
  );
  await expect(
    page.getByText('Enable JavaScript to analyze and preview structures', {
      exact: false,
    })
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://prameshsharma.com/tools/amyloid-inspector'
  );
  expect(await (await request.get('/sitemap.xml')).text()).toContain(
    'https://prameshsharma.com/tools/amyloid-inspector'
  );
  await context.close();
});
