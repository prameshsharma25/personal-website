import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const lysozyme = fs.readFileSync('public/tools/protein-annotations/1LYZ.pdb');
const rfah = fs.readFileSync('public/structures/rfah/2LCL-CTD.pdb');

test('RfaH comparison computes in a worker, links chart selection, and exports numerical results and image', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.postData()?.includes('ATOM'))
      uploads.push(r.url());
  });
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Compare RfaH States' }).click();
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  const metrics = page.getByLabel('Comparison Metrics');
  await expect(metrics).toContainText('42');
  await expect(metrics).toContainText('100%');
  await expect(
    page.getByText(
      'Primary Coverage 100% · Comparison Coverage 88% · 0 Substitutions'
    )
  ).toBeVisible();
  await page.getByRole('button', { name: 'Select Largest Difference' }).click();
  const sequence = page.getByLabel('Protein Sequence', { exact: true });
  await expect(sequence.locator('[aria-pressed="true"]')).toHaveCount(1);
  await page.getByLabel('Compared Residue', { exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(sequence.locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(sequence.locator('[aria-pressed="true"]')).toContainText('115');
  await page.getByLabel('Color By').selectOption('Difference');
  await page.getByLabel('Visible Structures').selectOption('Comparison');
  await page.getByLabel('Visible Structures').selectOption('Both');
  const jsonDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download Comparison Report' })
    .click();
  const json = JSON.parse(
    fs.readFileSync(await (await jsonDownload).path(), 'utf8')
  );
  expect(json.schema).toBe('protein-structure-comparison-1.0');
  expect(json.pairs).toHaveLength(42);
  expect(json.unmatched.comparison).toHaveLength(6);
  expect(json.metrics.rmsd).toBeGreaterThan(1);
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Residue CSV' }).click();
  expect(
    fs.readFileSync(await (await csvDownload).path(), 'utf8').split('\r\n')
  ).toHaveLength(43);
  const imageDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Image' }).click();
  const png = fs.readFileSync(await (await imageDownload).path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.length).toBeGreaterThan(10000);
  const reviewDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export Review', exact: true })
    .click();
  expect(
    JSON.parse(fs.readFileSync(await (await reviewDownload).path(), 'utf8'))
      .comparison.pairs
  ).toHaveLength(42);
  await page
    .getByRole('button', { name: 'Annotation View', exact: true })
    .click();
  await expect(page.locator('[data-annotation-viewer="ready"]')).toBeVisible();
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  expect(errors).toEqual([]);
  expect(uploads).toEqual([]);
});

test('comparison selection is linked to reference annotations and changing protein clears comparison', async ({
  page,
}) => {
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Try Lysozyme' }).click();
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
  await page.getByLabel('Comparison Structure', { exact: true }).setInputFiles({
    name: 'second-lysozyme.pdb',
    mimeType: 'text/plain',
    buffer: lysozyme,
  });
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await expect(page.getByLabel('Comparison Metrics')).toContainText('0.00');
  const slider = page.getByLabel('Compared Residue', { exact: true });
  await slider.focus();
  await page.keyboard.press('Home');
  for (let i = 1; i < 52; i++) await page.keyboard.press('ArrowRight');
  const sequence = page.getByLabel('Protein Sequence', { exact: true });
  await expect(
    sequence.getByRole('button', {
      name: 'ASP 52, A, Reference 70',
      exact: true,
    })
  ).toHaveAttribute('aria-pressed', 'true');
  const panel = page.getByRole('complementary', { name: 'Region Annotations' });
  await expect(
    panel.getByRole('button', {
      name: 'Highlight Active Site At Reference 70',
      exact: true,
    })
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Clear Selection', exact: true })
    .count();
  await page
    .getByRole('button', { name: 'Clear Selection', exact: true })
    .click();
  await panel
    .getByRole('button', {
      name: 'Highlight Active Site At Reference 53',
      exact: true,
    })
    .click();
  await expect(
    sequence.getByRole('button', {
      name: 'GLU 35, A, Reference 53',
      exact: true,
    })
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Upload Protein', { exact: true }).setInputFiles({
    name: 'rfah-new.pdb',
    mimeType: 'text/plain',
    buffer: rfah,
  });
  await expect(
    page.getByRole('heading', { name: 'rfah-new.pdb', exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('Comparison Metrics')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Annotation View', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
  await expect(
    page.getByText('second-lysozyme.pdb', { exact: false })
  ).toHaveCount(0);
});

test('invalid correspondence clears the previous fit and mobile layout remains contained', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Compare RfaH States' }).click();
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    )
  ).toBe(true);
  await page.screenshot({
    path: '.local/comparison-mobile.png',
    fullPage: true,
  });
  await page.getByLabel('Comparison Structure', { exact: true }).setInputFiles({
    name: 'wrong-protein.pdb',
    mimeType: 'text/plain',
    buffer: lysozyme,
  });
  await expect(
    page
      .getByLabel('Protein Structure Comparison', { exact: true })
      .getByRole('alert')
  ).toContainText(/alignment|correspondence/);
  await expect(page.getByLabel('Comparison Metrics')).toHaveCount(0);
  await expect(page.locator('[data-annotation-viewer="ready"]')).toBeVisible();
  const reviewDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export Review', exact: true })
    .click();
  expect(
    JSON.parse(fs.readFileSync(await (await reviewDownload).path(), 'utf8'))
      .comparison
  ).toBeNull();
  await page
    .getByRole('button', { name: 'Remove Comparison', exact: true })
    .click();
  await expect(
    page
      .getByLabel('Protein Structure Comparison', { exact: true })
      .getByRole('alert')
  ).toHaveCount(0);
});

test('switching chains recalculates the fit and a rapid replacement cannot restore stale results', async ({
  page,
}) => {
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Compare RfaH States' }).click();
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  // A second unrelated chain forces an explicit choice; it cannot inherit the prior fit.
  const lines = (text: string, chain: string) =>
    text
      .split('\n')
      .filter((l) => l.startsWith('ATOM'))
      .map((l) => l.slice(0, 21) + chain + l.slice(22))
      .join('\n');
  const multi = Buffer.from(
    lines(rfah.toString(), 'B') +
      '\n' +
      lines(lysozyme.toString(), 'C') +
      '\nEND\n'
  );
  await page.getByLabel('Comparison Structure', { exact: true }).setInputFiles({
    name: 'two-chains.pdb',
    mimeType: 'text/plain',
    buffer: multi,
  });
  await expect(page.getByLabel('Comparison Chain')).toHaveValue('B');
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await page.getByLabel('Comparison Chain').selectOption('C');
  await expect(
    page
      .getByLabel('Protein Structure Comparison', { exact: true })
      .getByRole('alert')
  ).toContainText(/alignment|correspondence/);
  await expect(page.getByLabel('Comparison Metrics')).toHaveCount(0);
  await page.getByLabel('Comparison Chain').selectOption('B');
  await page.getByRole('button', { name: 'Try Lysozyme' }).click();
  await expect(page.locator('[data-annotation-viewer="ready"]')).toBeVisible();
  await expect(page.getByLabel('Comparison Metrics')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
  await expect(page.getByLabel('Comparison Chain')).toHaveCount(0);
});

test('real 3D picking on the comparison model selects the paired primary residue', async ({
  page,
}) => {
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Compare RfaH States' }).click();
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await page
    .locator('[data-comparison-viewer]')
    .screenshot({ path: '.local/comparison-overlay.png' });
  await page.getByLabel('Visible Structures').selectOption('Comparison');
  const canvas = page.locator('[data-comparison-viewer] canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  let picked = false;
  for (const x of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    for (const y of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const point = { x: box.x + box.width * x, y: box.y + box.height * y };
      await page.mouse.move(point.x, point.y);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      const tooltip = page.getByRole('tooltip');
      if (
        (await tooltip.isVisible()) &&
        (await tooltip.innerText()).includes('Click To Select')
      ) {
        await expect(tooltip).toContainText('Comparison');
        const readout = await page
          .locator('[data-comparison-residue]')
          .innerText();
        const number = readout.match(/Primary \w+ (\S+)/)[1];
        await page.mouse.click(point.x, point.y);
        const chosen = page
          .getByLabel('Protein Sequence', { exact: true })
          .locator('[aria-pressed="true"]');
        await expect(chosen).toHaveCount(1);
        await expect(chosen).toContainText(number);
        picked = true;
        break;
      }
    }
    if (picked) break;
  }
  expect(picked).toBe(true);
});

test('comparison reports remain available when molecular rendering cannot load', async ({
  page,
}) => {
  await page.route('**/vendor/3dmol/**', (route) => route.abort());
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Compare RfaH States' }).click();
  await expect(
    page.locator('[data-comparison-viewer="unavailable"]')
  ).toBeVisible();
  await expect(page.getByLabel('Comparison Metrics')).toContainText('42');
  await expect(
    page.getByRole('button', { name: 'Download Image', exact: true })
  ).toBeDisabled();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download Comparison Report' })
    .click();
  expect(
    JSON.parse(fs.readFileSync(await (await download).path(), 'utf8')).pairs
  ).toHaveLength(42);
});
