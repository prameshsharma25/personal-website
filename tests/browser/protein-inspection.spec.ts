import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
const lysozyme = fs.readFileSync('public/tools/protein-annotations/1LYZ.pdb');
const reference = JSON.parse(
  fs.readFileSync('public/tools/protein-annotations/P00698.json', 'utf8')
);
const secondaryReference = {
  ...reference,
  name: 'Protein Two Reference',
  accession: 'P12345',
  annotations: reference.annotations.map((a) => ({
    ...a,
    id: `second-${a.id}`,
    description: `Protein Two Evidence: ${a.description}`,
  })),
};
const inspect = (page: Page, n: number) =>
  page
    .getByRole('button', { name: `Inspect Protein ${n}`, exact: true })
    .last()
    .click();
const sequence = (page: Page) =>
  page.getByLabel('Protein Sequence', { exact: true });
const panel = (page: Page) =>
  page.getByRole('complementary', { name: 'Region Annotations' });
async function openPair(page: Page) {
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Try Lysozyme' }).click();
  await expect(page.locator('[data-annotation-viewer="ready"]')).toBeVisible();
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
  await page.getByLabel('Comparison Structure', { exact: true }).setInputFiles({
    name: 'second-lysozyme.pdb',
    mimeType: 'text/plain',
    buffer: lysozyme,
  });
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
}
async function requestSecondaryReference(page: Page) {
  await page
    .getByText('Optional: Add Reference Annotations To Protein 2', {
      exact: true,
    })
    .click();
  await page.getByLabel('UniProt Accession', { exact: true }).fill('P12345');
  await page
    .getByRole('button', { name: 'Load Annotations', exact: true })
    .click();
}
async function exportJson(page: Page, name: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  return JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
}

test('each protein retains its own selection, notes, and annotation evidence even with identical residue keys', async ({
  page,
}) => {
  await page.route(
    '**/api/protein-annotations?kind=reference&id=P12345',
    (route) => route.fulfill({ json: secondaryReference })
  );
  await openPair(page);
  await sequence(page)
    .getByRole('button', { name: 'GLU 35, A, Reference 53', exact: true })
    .click();
  await page.getByText('Save A Region And Notes', { exact: true }).click();
  await page
    .getByLabel('Region Name', { exact: true })
    .fill('Primary Catalytic Region');
  await page
    .getByLabel('Research Notes', { exact: true })
    .fill('My primary notes');
  await page
    .getByRole('button', { name: 'Save Selected Region', exact: true })
    .click();
  await inspect(page, 2);
  await expect(sequence(page).locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(panel(page)).toContainText('Protein 2 · second-lysozyme.pdb');
  await expect(panel(page)).not.toContainText('P00698');
  await expect(
    page.getByRole('button', { name: 'Primary Catalytic Region · 1 Residues' })
  ).toHaveCount(0);
  await requestSecondaryReference(page);
  await expect(panel(page)).toContainText('P12345');
  await panel(page)
    .getByRole('button', {
      name: 'Highlight Active Site At Reference 70',
      exact: true,
    })
    .click();
  await expect(
    sequence(page).getByRole('button', {
      name: 'ASP 52, A, Reference 70',
      exact: true,
    })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page)).toContainText('Protein Two Evidence:');
  await page
    .getByLabel('Region Name', { exact: true })
    .fill('Secondary Catalytic Region');
  await page
    .getByLabel('Research Notes', { exact: true })
    .fill('My secondary notes');
  await page
    .getByRole('button', { name: 'Save Selected Region', exact: true })
    .click();
  const review = await exportJson(page, 'Export Review');
  expect(review.inspectedProtein).toBe('comparison');
  expect(review.input.name).toBe('second-lysozyme.pdb');
  expect(review.selectedResidues[0].number).toBe('52');
  expect(review.proteins.primary.savedRegions[0].notes).toBe(
    'My primary notes'
  );
  expect(review.proteins.comparison.savedRegions[0].notes).toBe(
    'My secondary notes'
  );
  expect(review.comparison.reference.accession).toBe('P00698');
  expect(review.comparison.comparisonReference.accession).toBe('P12345');
  expect(
    review.comparison.pairs.some((p) =>
      p.comparisonAnnotations.some((a) => a.id.startsWith('second-'))
    )
  ).toBe(true);
  await inspect(page, 1);
  await expect(
    sequence(page).getByRole('button', {
      name: 'GLU 35, A, Reference 53',
      exact: true,
    })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page)).toContainText('P00698');
  await expect(panel(page)).not.toContainText('Protein Two Evidence:');
  await expect(
    page.getByRole('button', { name: 'Primary Catalytic Region · 1 Residues' })
  ).toBeVisible();
  await inspect(page, 2);
  await expect(
    sequence(page).getByRole('button', {
      name: 'ASP 52, A, Reference 70',
      exact: true,
    })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', {
      name: 'Secondary Catalytic Region · 1 Residues',
    })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Annotation View', exact: true })
    .click();
  await sequence(page)
    .getByRole('button', { name: 'ALA 10, A, Reference 28', exact: true })
    .click({ modifiers: ['Shift'] });
  await expect(sequence(page).locator('[aria-pressed="true"]')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
  await expect(
    sequence(page).getByRole('button', {
      name: 'ASP 52, A, Reference 70',
      exact: true,
    })
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: 'Clear Protein', exact: true })
    .click();
  await expect(panel(page)).toContainText('P00698');
  await expect(
    page.getByRole('button', { name: 'Inspect Protein 2', exact: true })
  ).toHaveCount(0);
});

test('a reference request stays with Protein 2 when inspection switches before it completes', async ({
  page,
}) => {
  let release: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    '**/api/protein-annotations?kind=reference&id=P12345',
    async (route) => {
      await gate;
      await route.fulfill({ json: secondaryReference });
    }
  );
  await openPair(page);
  await inspect(page, 2);
  const requested = page.waitForRequest(
    '**/api/protein-annotations?kind=reference&id=P12345'
  );
  await requestSecondaryReference(page);
  await requested;
  await inspect(page, 1);
  release();
  await expect(
    page.getByRole('button', { name: 'Load Annotations', exact: true })
  ).toBeEnabled();
  await expect(panel(page)).toContainText('P00698');
  await expect(panel(page)).not.toContainText('P12345');
  await inspect(page, 2);
  await expect(panel(page)).toContainText('P12345');
});

test('replacing Protein 2 discards old inspection state and ignores its pending reference response', async ({
  page,
}) => {
  let release: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    '**/api/protein-annotations?kind=reference&id=P12345',
    async (route) => {
      await gate;
      await route.fulfill({ json: secondaryReference });
    }
  );
  await openPair(page);
  await inspect(page, 2);
  await sequence(page)
    .getByRole('button', { name: 'ASP 52, A', exact: true })
    .click();
  const requested = page.waitForRequest(
    '**/api/protein-annotations?kind=reference&id=P12345'
  );
  await requestSecondaryReference(page);
  await requested;
  await page
    .getByLabel('Comparison Structure', { exact: true })
    .setInputFiles('public/structures/rfah/2LCL-CTD.pdb');
  release();
  await expect(
    page.getByRole('button', { name: 'Load Annotations', exact: true })
  ).toBeEnabled();
  await inspect(page, 2);
  await expect(panel(page)).toContainText('2LCL-CTD.pdb');
  await expect(panel(page)).not.toContainText('P12345');
  await expect(sequence(page).locator('[aria-pressed="true"]')).toHaveCount(0);
});

test('Protein 2 chart selection, unpaired residues, and inspection switching preserve camera and alignment', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    (window as any).__workers = 0;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as any).__workers++;
      }
    };
  });
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Try Lysozyme' }).click();
  await expect(page.locator('[data-annotation-viewer="ready"]')).toBeVisible();
  await page.evaluate(() => {
    const library = (window as any).$3Dmol;
    const create = library.createViewer.bind(library);
    (window as any).$3Dmol = {
      ...library,
      createViewer: (element: HTMLElement, config: object) => {
        const scene = create(element, config);
        if (element.closest('[data-comparison-viewer]'))
          (window as any).__scene = scene;
        return scene;
      },
    };
  });
  await page.getByRole('button', { name: 'Compare RfaH States' }).click();
  await page
    .getByRole('combobox', { name: 'Alignment Method', exact: true })
    .selectOption('sequence');
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await page.evaluate(() => {
    (window as any).__scene.rotate(32, 'y');
    (window as any).__scene.render();
  });
  const snapshot = await page.evaluate(() => ({
    camera: (window as any).__scene.getView(),
    workers: (window as any).__workers,
  }));
  await page
    .getByRole('button', { name: 'Protein 1 Only', exact: true })
    .click();
  await inspect(page, 2);
  await expect(sequence(page).getByRole('button')).toHaveCount(48);
  await expect(page.locator('[data-comparison-viewer]')).toHaveAttribute(
    'data-visible-structures',
    'Comparison'
  );
  await page.getByRole('button', { name: 'Overlay', exact: true }).click();
  await page.getByLabel('Compared Residue', { exact: true }).focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  const report = await exportJson(page, 'Download Comparison Report');
  await expect(sequence(page).locator('[aria-pressed="true"]')).toContainText(
    report.pairs[0].comparison.number
  );
  // End the transient chart hover before inspecting the persistent selection style.
  await page
    .getByRole('img', {
      name: 'Alpha carbon distance for each aligned residue, in angstroms',
      exact: true,
    })
    .hover();
  await page.mouse.move(1, 1);
  const goldPositions = () =>
    page.evaluate(() =>
      [0, 1].map((model) => [
        ...new Set(
          (window as any).__scene
            .selectedAtoms({ model })
            .filter((a: any) => a.style?.cartoon?.color === '#ffdc76')
            .map((a: any) => a.resi)
        ),
      ])
    );
  await expect
    .poll(goldPositions)
    .toEqual([
      [report.pairs[0].primary.viewerPosition],
      [report.pairs[0].comparison.viewerPosition],
    ]);
  const unpaired = report.unmatched.comparison[0];
  await sequence(page)
    .getByRole('button', {
      name: `${unpaired.name} ${unpaired.number}, A`,
      exact: true,
    })
    .click();
  await page.mouse.move(1, 1);
  await expect.poll(goldPositions).toEqual([[], [unpaired.viewerPosition]]);
  expect(
    await page.evaluate(() => ({
      camera: (window as any).__scene.getView(),
      workers: (window as any).__workers,
    }))
  ).toEqual(snapshot);
  await inspect(page, 1);
  await expect(sequence(page).getByRole('button')).toHaveCount(42);
  await expect(sequence(page).locator('[aria-pressed="true"]')).toHaveCount(0);
  await inspect(page, 2);
  await expect(sequence(page).locator('[aria-pressed="true"]')).toContainText(
    unpaired.number
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('button', { name: 'Inspect Protein 2', exact: true }).last()
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    )
  ).toBe(true);
  await page
    .getByRole('group', { name: 'Protein To Inspect' })
    .last()
    .screenshot({ path: '.local/inspection-controls-mobile.png' });
});

test('real 3D picking while inspecting Protein 2 selects its own residue', async ({
  page,
}) => {
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Compare RfaH States' }).click();
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  await page
    .locator('[data-comparison-viewer]')
    .screenshot({ path: '.local/protein2-inspection.png' });
  await page
    .getByRole('button', { name: 'Protein 2 Only', exact: true })
    .click();
  await inspect(page, 2);
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
        const number = readout.match(/Comparison \w+ (\S+)/)[1];
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
