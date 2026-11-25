import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const fixture = path.resolve('public/tools/amyloid-example/2beg.pdb');

test('Tools precedes Books and a PDB previews without a report', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/amyloid-config', (route) =>
    route.fulfill({ json: { enabled: false } })
  );
  await page.goto('/tools/amyloid-inspector');
  const navigation = await page
    .getByRole('navigation', { name: 'Main Navigation' })
    .getByRole('link')
    .allTextContents();
  expect(
    navigation.findIndex((label) => label.trim() === 'Tools')
  ).toBeLessThan(navigation.findIndex((label) => label.trim() === 'Books'));
  await page
    .getByLabel('Choose Structures', { exact: true })
    .setInputFiles(fixture);
  await expect(page.getByText('Structure Only', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Analysis Not Yet Calculated' })
  ).toBeVisible();
  await expect(page.locator('[data-viewer="ready"]')).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.getByRole('button', { name: 'Analyze 1 Structure', exact: true })
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test('expired session unlocks a new upload', async ({ page }) => {
  const api = 'http://127.0.0.1:8001';
  await page.addInitScript(
    ({ api }) =>
      sessionStorage.setItem(
        'amyloid-analysis-session-v1',
        JSON.stringify({ api, id: 'a'.repeat(32), token: 'expired' })
      ),
    { api }
  );
  await page.route('**/api/amyloid-config', (route) =>
    route.fulfill({ json: { enabled: true, url: api } })
  );
  await page.route('**/health', (route) =>
    route.fulfill({
      json: {
        max_files: 125,
        max_file_bytes: 26214400,
        max_total_bytes: 104857600,
        retention_hours: 24,
      },
    })
  );
  await page.route('**/jobs/' + 'a'.repeat(32), (route) =>
    route.fulfill({ status: 410, json: { detail: 'This job has expired.' } })
  );
  await page.goto('/tools/amyloid-inspector');
  await expect(page.locator('main [role=alert]')).toContainText('expired');
  await expect(
    page.getByLabel('Choose Structures', { exact: true })
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('amyloid-analysis-session-v1')
    )
  ).toBeNull();
});

test('real worker runs a batch, verifies reports, resumes, downloads, and deletes', async ({
  page,
}) => {
  test.skip(
    process.env.AMYLOID_INTEGRATION !== '1',
    'Requires the local Python worker.'
  );
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tools/amyloid-inspector');
  await expect(
    page.getByText('Analysis Service Connected', { exact: true })
  ).toBeVisible();
  const buffer = await readFile(fixture);
  await page.getByLabel('Choose Structures', { exact: true }).setInputFiles([
    { name: 'assembly-a.pdb', mimeType: 'text/plain', buffer },
    { name: 'assembly-b.pdb', mimeType: 'text/plain', buffer },
  ]);
  await page
    .getByRole('button', { name: 'Analyze 2 Structures', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Download Full Report', exact: true })
  ).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('table')).toContainText('assembly-a.pdb');
  await expect(page.getByRole('table')).toContainText('assembly-b.pdb');
  await expect(
    page.getByText('SHA-256 Matched', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Too few comparable structures', { exact: false })
  ).toBeVisible();
  await page.getByText('Not Selected', { exact: true }).first().click();
  await expect(
    page.getByText('Confidence Not Provided', { exact: true }).first()
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('amyloid-analysis-session-v1')!)
  );
  const downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download Full Report', exact: true })
    .click();
  const archive = await downloaded;
  expect(archive.suggestedFilename()).toBe('amyloid-analysis.zip');
  await archive.saveAs('/private/tmp/amyloid-browser-verified-results.zip');
  await page.reload();
  await expect(page.getByRole('table')).toContainText('assembly-b.pdb', {
    timeout: 20000,
  });
  await expect(
    page.getByText('SHA-256 Matched', { exact: true })
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page
    .getByRole('button', { name: 'Delete Job Files', exact: true })
    .click();
  await expect(page.getByRole('table')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('amyloid-analysis-session-v1')
    )
  ).toBeNull();
  expect(errors).toEqual([]);
  const response = await page.request.get(`${saved.api}/jobs/${saved.id}`, {
    headers: { Authorization: `Bearer ${saved.token}` },
  });
  expect((await response.json()).state).toBe('cancelled');
});

test('a temporary status error retries without losing the job', async ({
  page,
}) => {
  const api = 'http://127.0.0.1:8001';
  const id = 'b'.repeat(32);
  await page.addInitScript(
    ({ api, id }) =>
      sessionStorage.setItem(
        'amyloid-analysis-session-v1',
        JSON.stringify({ api, id, token: 'test-only' })
      ),
    { api, id }
  );
  await page.route('**/api/amyloid-config', (route) =>
    route.fulfill({ json: { enabled: true, url: api } })
  );
  await page.route('**/health', (route) =>
    route.fulfill({
      json: {
        max_files: 125,
        max_file_bytes: 26214400,
        max_total_bytes: 104857600,
        retention_hours: 24,
      },
    })
  );
  let polls = 0;
  await page.route(`**/jobs/${id}`, (route) => {
    polls++;
    return polls === 1
      ? route.fulfill({
          status: 503,
          json: { detail: 'Temporarily unavailable' },
        })
      : route.fulfill({
          json: {
            id,
            state: 'failed',
            error: 'Example worker failure',
            expires_at: 0,
          },
        });
  });
  await page.goto('/tools/amyloid-inspector');
  await expect(
    page.getByText('The connection was interrupted.', { exact: false })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Failed', exact: true })
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByLabel('Choose Structures', { exact: true })
  ).toBeEnabled();
  expect(polls).toBe(2);
  await page
    .getByLabel('Choose Structures', { exact: true })
    .setInputFiles(fixture);
  await page.route('**/jobs', (route) =>
    route.fulfill({
      status: 429,
      json: { detail: 'The analysis queue is full.' },
    })
  );
  await page
    .getByRole('button', { name: 'Analyze 1 Structure', exact: true })
    .click();
  await expect(page.locator('main [role="alert"]')).toContainText(
    'queue is full'
  );
  await expect(
    page.getByLabel('Choose Structures', { exact: true })
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Analyze 1 Structure', exact: true })
  ).toBeEnabled();
});
