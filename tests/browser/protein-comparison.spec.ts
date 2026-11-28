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
  await page
    .getByRole('combobox', { name: 'Alignment Method', exact: true })
    .selectOption('sequence');
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  const metrics = page.getByLabel('Comparison Metrics');
  await expect(metrics).toContainText('42');
  await expect(metrics).toContainText('100%');
  await expect(
    page.getByText(
      'Primary Coverage 100% · Comparison Coverage 88% · 0 Nonidentical Pairs'
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
  await page
    .getByRole('button', { name: 'Protein 2 Only', exact: true })
    .click();
  await page.getByRole('button', { name: 'Overlay', exact: true }).click();
  const jsonDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download Comparison Report' })
    .click();
  const json = JSON.parse(
    fs.readFileSync(await (await jsonDownload).path(), 'utf8')
  );
  expect(json.schema).toBe('protein-structure-comparison-1.1');
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

test('comparison selection links annotations and replacing Protein 1 preserves Protein 2', async ({
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
  await expect(slider).toHaveValue('52');
  await page.mouse.move(1, 1);
  await expect(slider).toHaveValue('52');
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
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Compare Structures', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('group', { name: 'Protein 2 Input' })
  ).toContainText('second-lysozyme.pdb');
  const replacedDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download Comparison Report' })
    .click();
  const replaced = JSON.parse(
    fs.readFileSync(await (await replacedDownload).path(), 'utf8')
  );
  expect(replaced.primary.name).toBe('rfah-new.pdb');
  expect(replaced.comparison.name).toBe('second-lysozyme.pdb');
});

test('weak structural matches are displayed and mobile layout remains contained', async ({
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
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await expect(
    page.getByLabel('Alignment Method And Interpretation')
  ).toContainText('Sequence identity is low');
  const reviewDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export Review', exact: true })
    .click();
  const review = JSON.parse(
    fs.readFileSync(await (await reviewDownload).path(), 'utf8')
  );
  expect(review.comparison.comparison.name).toBe('wrong-protein.pdb');
  expect(review.comparison.mode).toBe('structure');
  expect(review.comparison.metrics.sequenceIdentity).toBeLessThan(0.9);
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
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  const changedDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download Comparison Report' })
    .click();
  const changed = JSON.parse(
    fs.readFileSync(await (await changedDownload).path(), 'utf8')
  );
  expect(changed.comparison.chain).toBe('C');
  expect(changed.metrics.comparisonCount).toBe(129);
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
  await page
    .getByRole('button', { name: 'Protein 2 Only', exact: true })
    .click();
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
  await page
    .getByRole('combobox', { name: 'Alignment Method', exact: true })
    .selectOption('sequence');
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

test('2OUG and 5JYT align locally with low scores and both methods remain available', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/tools/protein-annotations');
  await page
    .getByLabel('Upload Protein', { exact: true })
    .setInputFiles('tests/fixtures/protein-comparison/2OUG-chain-A.pdb');
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Alignment Method', exact: true })
  ).toHaveValue('structure');
  await page
    .getByLabel('Comparison Structure', { exact: true })
    .setInputFiles('tests/fixtures/protein-comparison/5JYT-chain-A.pdb');
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await expect(page.getByLabel('Comparison Metrics')).toContainText('4.72');
  await expect(page.getByLabel('Comparison Metrics')).toContainText('68');
  await expect(page.getByLabel('Structural Similarity Scores')).toContainText(
    '0.300'
  );
  await expect(page.getByLabel('Structural Similarity Scores')).toContainText(
    '0.365'
  );
  await expect(
    page.getByLabel('Alignment Method And Interpretation')
  ).toContainText('Sequence identity is low');
  await page.getByRole('button', { name: 'Select Largest Difference' }).click();
  await expect(
    page
      .getByLabel('Protein Sequence', { exact: true })
      .locator('[aria-pressed="true"]')
  ).toHaveCount(1);
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download Comparison Report' })
    .click();
  const result = JSON.parse(
    fs.readFileSync(await (await download).path(), 'utf8')
  );
  expect(result.mode).toBe('structure');
  expect(result.pairs).toHaveLength(68);
  expect(result.metrics.tmScores).toEqual({
    primary: 0.29981,
    comparison: 0.36549,
  });
  expect(result.structuralAlignment.reportedRmsd).toBe(4.63);
  expect(result.metrics.rmsd).toBeCloseTo(4.7236475, 5);
  await page
    .getByRole('combobox', { name: 'Alignment Method', exact: true })
    .selectOption('sequence');
  await expect(
    page.getByLabel('Alignment Method And Interpretation')
  ).toContainText('Several sequence alignments have the same score');
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await expect(page.getByLabel('Structural Similarity Scores')).toHaveCount(0);
  await expect(
    page
      .getByLabel('Protein Structure Comparison', { exact: true })
      .getByRole('alert')
  ).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'Alignment Method', exact: true })
    .selectOption('structure');
  await expect(page.getByLabel('Structural Similarity Scores')).toContainText(
    '0.300'
  );
  expect(errors).toEqual([]);
});

test('an unavailable structural engine can be bypassed by choosing sequence correspondence', async ({
  page,
}) => {
  await page.route('**/mmalign.wasm', (route) => route.abort());
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Compare RfaH States' }).click();
  await expect(
    page
      .getByLabel('Protein Structure Comparison', { exact: true })
      .getByRole('alert')
  ).toContainText('Sequence Correspondence');
  await page
    .getByRole('combobox', { name: 'Alignment Method', exact: true })
    .selectOption('sequence');
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await expect(page.getByLabel('Comparison Metrics')).toContainText('42');
});

test('comparison inputs are visible before loading and accept either order without losing the other protein', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/tools/protein-annotations');
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
  const first = page.getByRole('group', { name: 'Protein 1 Input' });
  const second = page.getByRole('group', { name: 'Protein 2 Input' });
  await expect(
    first.getByLabel('Upload Protein', { exact: true })
  ).toBeVisible();
  await expect(
    second.getByLabel('Comparison Structure', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'View Comparison' })
  ).toBeDisabled();
  await second
    .getByLabel('Comparison Structure', { exact: true })
    .setInputFiles('tests/fixtures/protein-comparison/5JYT-chain-A.pdb');
  await expect(second).toContainText('5JYT-chain-A.pdb');
  await first
    .getByLabel('Upload Protein', { exact: true })
    .setInputFiles('tests/fixtures/protein-comparison/2OUG-chain-A.pdb');
  await expect(first).toContainText('2OUG-chain-A.pdb');
  await expect(second).toContainText('5JYT-chain-A.pdb');
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await expect(page.getByLabel('Comparison Metrics')).toContainText('68');
  await expect(
    page.getByRole('button', { name: 'View Comparison' })
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Annotation View', exact: true })
    .click();
  await expect(page.locator('[data-annotation-viewer="ready"]')).toBeVisible();
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
  await expect(second).toContainText('5JYT-chain-A.pdb');
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  // A failed replacement must remove the obsolete comparison, without losing Protein 1.
  await second
    .getByLabel('Comparison Structure', { exact: true })
    .setInputFiles({
      name: 'invalid.pdb',
      mimeType: 'text/plain',
      buffer: Buffer.from('not coordinates'),
    });
  await expect(second.getByRole('alert')).toBeVisible();
  await expect(first).toContainText('2OUG-chain-A.pdb');
  await expect(page.getByLabel('Comparison Metrics')).toHaveCount(0);
  await second
    .getByLabel('Comparison Structure', { exact: true })
    .setInputFiles('tests/fixtures/protein-comparison/5JYT-chain-A.pdb');
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await expect(second.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'View Comparison' }).click();
  await expect(
    page
      .locator('[tabindex="-1"]')
      .filter({
        has: page.getByLabel('Protein Structure Comparison', { exact: true }),
      })
      .last()
  ).toBeFocused();
  expect(errors).toEqual([]);
});

test('view buttons change actual rendered proteins while preserving the camera, selection, and computation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    (window as any).__comparisonWorkers = 0;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as any).__comparisonWorkers++;
      }
    };
  });
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Try Lysozyme' }).click();
  await expect(page.locator('[data-annotation-viewer="ready"]')).toBeVisible();
  // Observe the real renderer's camera without adding production test hooks.
  await page.evaluate(() => {
    const library = (window as any).$3Dmol;
    const create = library.createViewer.bind(library);
    (window as any).$3Dmol = {
      ...library,
      createViewer: (element: HTMLElement, config: object) => {
        const scene = create(element, config);
        if (element.closest('[data-comparison-viewer]'))
          (window as any).__comparisonScene = scene;
        return scene;
      },
    };
  });
  await page.getByRole('button', { name: 'Compare RfaH States' }).click();
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  const viewer = page.locator('[data-comparison-viewer]');
  const colors = async () => {
    await page.mouse.move(1, 1);
    const png = await viewer.locator('canvas').first().screenshot();
    return page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let blue = 0,
        orange = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        // Ignore the blue frame around the canvas, which is visible in every mode.
        const x = (i / 4) % canvas.width,
          y = Math.floor(i / 4 / canvas.width);
        if (x < 5 || y < 5 || x >= canvas.width - 5 || y >= canvas.height - 5)
          continue;
        const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
        // Exclude gray unpaired residues, including their antialiased edges.
        if (b > 70 && b > r * 1.8 && g > r * 1.45) blue++;
        if (r > 70 && r > g * 1.2 && g > b * 1.2) orange++;
      }
      return { blue, orange };
    }, png.toString('base64'));
  };
  // Rotate once so an inadvertent camera reset is detectable.
  await page.evaluate(() => {
    const scene = (window as any).__comparisonScene;
    scene.rotate(32, 'y');
    scene.render();
  });
  const snapshot = await page.evaluate(() => ({
    camera: (window as any).__comparisonScene.getView(),
    workers: (window as any).__comparisonWorkers,
  }));
  const both = await colors();
  expect(both.blue).toBeGreaterThan(50);
  expect(both.orange).toBeGreaterThan(50);
  await page
    .getByRole('button', { name: 'Protein 1 Only', exact: true })
    .click();
  await expect(viewer).toHaveAttribute('data-visible-structures', 'Primary');
  await expect(
    page.getByRole('button', { name: 'Protein 1 Only', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  const primary = await colors();
  expect(primary.blue).toBeGreaterThan(50);
  expect(primary.orange).toBeLessThan(5);
  await page
    .getByRole('button', { name: 'Protein 2 Only', exact: true })
    .click();
  const secondary = await colors();
  expect(secondary.orange).toBeGreaterThan(50);
  expect(secondary.blue).toBeLessThan(5); // Allow isolated antialiasing pixels.
  expect(
    await page.evaluate(() =>
      (window as any).__comparisonScene
        .selectedAtoms({ model: 0 })
        .every((atom: any) => Object.keys(atom.style).length === 0)
    )
  ).toBe(true);
  await expect(page.getByLabel('Proteins In This Comparison')).toContainText(
    'Hidden'
  );
  await page.getByRole('button', { name: 'Overlay', exact: true }).click();
  expect(
    await page.evaluate(() => ({
      camera: (window as any).__comparisonScene.getView(),
      workers: (window as any).__comparisonWorkers,
    }))
  ).toEqual(snapshot);
  const restored = await colors();
  expect(restored.blue).toBe(both.blue);
  expect(restored.orange).toBe(both.orange);
  await page.getByRole('button', { name: 'Select Largest Difference' }).click();
  await page
    .getByRole('button', { name: 'Protein 2 Only', exact: true })
    .click();
  await expect(
    page
      .getByLabel('Protein Sequence', { exact: true })
      .locator('[aria-pressed="true"]')
  ).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: 'Protein 1 Only', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Protein 1 Only', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  ).toBe(true);
  await viewer.screenshot({ path: '.local/comparison-switcher-mobile.png' });
});

// Coordinate fixtures stand in for provider models; these tests exercise loading, not biological identity.
function accessionFixture(id: string, text: string) {
  const names: Record<string, string> = {
    ALA: 'A',
    ARG: 'R',
    ASN: 'N',
    ASP: 'D',
    CYS: 'C',
    GLN: 'Q',
    GLU: 'E',
    GLY: 'G',
    HIS: 'H',
    ILE: 'I',
    LEU: 'L',
    LYS: 'K',
    MET: 'M',
    PHE: 'F',
    PRO: 'P',
    SER: 'S',
    THR: 'T',
    TRP: 'W',
    TYR: 'Y',
    VAL: 'V',
  };
  const sequence = text
    .split('\n')
    .filter((l) => l.startsWith('ATOM') && l.slice(12, 16).trim() === 'CA')
    .map((l) => names[l.slice(17, 20).trim()])
    .join('');
  return {
    name: `AF-${id}.pdb`,
    text,
    sequence,
    url: `https://alphafold.ebi.ac.uk/files/AF-${id}-F1-model_v6.pdb`,
    label: `AlphaFold DB prediction for ${id}; model version 6`,
  };
}

test('two accessions load independently and their source identities survive alignment and export', async ({
  page,
}) => {
  let releasePrimary!: () => void;
  const primaryGate = new Promise<void>(
    (resolve) => (releasePrimary = resolve)
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/protein-annotations?kind=model&*', async (route) => {
    const id = new URL(route.request().url()).searchParams.get('id')!;
    if (id === 'P00698') await primaryGate;
    await route.fulfill({
      json: accessionFixture(
        id,
        id === 'P00698' ? lysozyme.toString() : rfah.toString()
      ),
    });
  });
  try {
    await page.goto('/tools/protein-annotations');
    await page
      .getByRole('button', { name: 'Compare Structures', exact: true })
      .click();
    const first = page.getByRole('group', { name: 'Protein 1 Input' }),
      second = page.getByRole('group', { name: 'Protein 2 Input' });
    await first.getByLabel('UniProt Accession For Protein 1').fill(' p00698 ');
    await first
      .getByRole('button', { name: 'Load Protein 1', exact: true })
      .click();
    await second.getByLabel('UniProt Accession For Protein 2').fill('q96ae4');
    await second
      .getByRole('button', { name: 'Load Protein 2', exact: true })
      .click();
    await expect(second).toContainText('AF-Q96AE4.pdb');
    await expect(
      first.getByRole('button', { name: 'Cancel Loading Protein 1' })
    ).toBeVisible();
    releasePrimary();
    await expect(first).toContainText('AF-P00698.pdb');
    await expect(
      page.locator('[data-comparison-viewer="ready"]')
    ).toBeVisible();
    await expect(first).toContainText('AlphaFold DB prediction for P00698');
    await expect(second).toContainText('AlphaFold DB prediction for Q96AE4');
    await page
      .getByRole('button', { name: 'Protein 2 Only', exact: true })
      .click();
    await expect(page.getByLabel('Proteins In This Comparison')).toContainText(
      'AF-Q96AE4.pdb'
    );
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download Comparison Report' })
      .click();
    const report = JSON.parse(
      fs.readFileSync(await (await download).path(), 'utf8')
    );
    expect(report.primary.name).toBe('AF-P00698.pdb');
    expect(report.comparison.name).toBe('AF-Q96AE4.pdb');
    expect(report.primary.origin).toContain('AF-P00698-F1-model_v6.pdb');
    expect(report.comparison.origin).toContain('AF-Q96AE4-F1-model_v6.pdb');
    expect(report.reference).toBeNull();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    ).toBe(true);
    await first
      .locator('..')
      .screenshot({ path: '.local/accession-cards-mobile.png' });
    expect(errors).toEqual([]);
  } finally {
    releasePrimary();
  }
});

test('mixed upload and accession inputs retain current structures on unavailable or inconsistent model responses', async ({
  page,
}) => {
  await page.route('**/api/protein-annotations?kind=model&*', (route) => {
    const id = new URL(route.request().url()).searchParams.get('id')!;
    if (id === 'P12345')
      return route.fulfill({
        status: 404,
        json: {
          error:
            'No AlphaFold model is available for this accession. Upload a PDB or mmCIF structure instead.',
        },
      });
    const model = accessionFixture(id, rfah.toString());
    if (id === 'Q96AE4') model.sequence = 'ACD' + model.sequence;
    return route.fulfill({ json: model });
  });
  await page.goto('/tools/protein-annotations');
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
  const first = page.getByRole('group', { name: 'Protein 1 Input' }),
    second = page.getByRole('group', { name: 'Protein 2 Input' });
  await first
    .getByLabel('Upload Protein', { exact: true })
    .setInputFiles({
      name: 'my-protein.pdb',
      mimeType: 'text/plain',
      buffer: lysozyme,
    });
  await second.getByLabel('UniProt Accession For Protein 2').fill('P00698');
  await second
    .getByRole('button', { name: 'Load Protein 2', exact: true })
    .click();
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await second.getByLabel('UniProt Accession For Protein 2').fill('P12345');
  await second
    .getByRole('button', { name: 'Load Protein 2', exact: true })
    .click();
  await expect(second.getByRole('alert')).toContainText(
    'Upload a PDB or mmCIF'
  );
  await expect(second).toContainText('AF-P00698.pdb');
  await expect(first).toContainText('my-protein.pdb');
  await first.getByLabel('UniProt Accession For Protein 1').fill('Q96AE4');
  await first
    .getByRole('button', { name: 'Load Protein 1', exact: true })
    .click();
  await expect(first.getByRole('alert')).toContainText(
    'coordinates do not match'
  );
  await expect(first).toContainText('my-protein.pdb');
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await second
    .getByLabel('Comparison Structure', { exact: true })
    .setInputFiles({
      name: 'uploaded-replacement.pdb',
      mimeType: 'text/plain',
      buffer: lysozyme,
    });
  await expect(second.getByRole('alert')).toHaveCount(0);
  await expect(second).toContainText('uploaded-replacement.pdb');
  await expect(page.getByLabel('Comparison Metrics')).toContainText('0.00');
});

for (const slot of [1, 2])
  test(`cancelled accession loading cannot overwrite a newer Protein ${slot}`, async ({
    page,
  }) => {
    let release!: () => void, settled!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      finished = new Promise<void>((r) => (settled = r));
    await page.route(
      '**/api/protein-annotations?kind=model&*',
      async (route) => {
        await gate;
        try {
          await route.fulfill({
            json: accessionFixture('Q96AE4', lysozyme.toString()),
          });
        } catch {
          /* The client aborted this request. */
        } finally {
          settled();
        }
      }
    );
    try {
      await page.goto('/tools/protein-annotations');
      await page.getByRole('button', { name: 'Compare RfaH States' }).click();
      await expect(
        page.locator('[data-comparison-viewer="ready"]')
      ).toBeVisible();
      const card = page.getByRole('group', { name: `Protein ${slot} Input` });
      await card
        .getByLabel(`UniProt Accession For Protein ${slot}`)
        .fill('Q96AE4');
      const started = page.waitForRequest((r) =>
        r.url().includes('kind=model')
      );
      await card
        .getByRole('button', { name: `Load Protein ${slot}`, exact: true })
        .click();
      await started;
      await card
        .getByRole('button', { name: `Cancel Loading Protein ${slot}` })
        .click();
      await card
        .getByLabel(slot === 1 ? 'Upload Protein' : 'Comparison Structure', {
          exact: true,
        })
        .setInputFiles({
          name: `latest-${slot}.pdb`,
          mimeType: 'text/plain',
          buffer: rfah,
        });
      await expect(card).toContainText(`latest-${slot}.pdb`);
      release();
      await finished;
      await expect(
        page.locator('[data-comparison-viewer="ready"]')
      ).toBeVisible();
      await expect(card).not.toContainText('AF-Q96AE4.pdb');
      const download = page.waitForEvent('download');
      await page
        .getByRole('button', { name: 'Download Comparison Report' })
        .click();
      const report = JSON.parse(
        fs.readFileSync(await (await download).path(), 'utf8')
      );
      expect(report[slot === 1 ? 'primary' : 'comparison'].name).toBe(
        `latest-${slot}.pdb`
      );
    } finally {
      release();
    }
  });

test('invalid accession validation stays within its card and does not request a model', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('kind=model')) requests.push(r.url());
  });
  await page.goto('/tools/protein-annotations');
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
  const first = page.getByRole('group', { name: 'Protein 1 Input' });
  await first.getByLabel('UniProt Accession For Protein 1').fill('Q96AE4-2');
  await first
    .getByRole('button', { name: 'Load Protein 1', exact: true })
    .click();
  await expect(first.getByRole('alert')).toContainText(
    'canonical UniProt accession'
  );
  expect(requests).toEqual([]);
});
