import { test, expect, type Page } from '@playwright/test';

async function observeRenderer(page: Page) {
  await page.addInitScript(() => {
    let library: any;
    (window as any).__colorScenes = {};
    (window as any).__colorWorkers = 0;
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as any).__colorWorkers++;
      }
    };
    Object.defineProperty(window, '$3Dmol', {
      configurable: true,
      get: () => library,
      set: (value) => {
        const create = value.createViewer.bind(value);
        library = {
          ...value,
          createViewer: (element: HTMLElement, config: object) => {
            const scene = create(element, config);
            const key = element.closest('[data-comparison-viewer]')
              ? 'comparison'
              : 'annotation';
            (window as any).__colorScenes[key] = scene;
            return scene;
          },
        };
      },
    });
  });
}

const atoms = (page: Page, viewer: string, representation = 'cartoon') =>
  page.evaluate(
    ({ viewer, representation }) => {
      const scene = (window as any).__colorScenes[viewer];
      return scene.selectedAtoms({ atom: 'CA' }).map((atom: any) => ({
        model: atom.model,
        chain: atom.chain,
        resi: atom.resi,
        resn: atom.resn,
        ss: atom.ss,
        color: (window as any).$3Dmol
          .getColorFromStyle(atom, atom.style[representation] || {})
          .getHex(),
      }));
    },
    { viewer, representation }
  );

const camera = (page: Page, viewer: string) =>
  page.evaluate(
    (viewer) => ({
      camera: (window as any).__colorScenes[viewer].getView(),
      workers: (window as any).__colorWorkers,
    }),
    viewer
  );

test('annotation palettes color actual residues and preserve selection and camera in cartoons and sticks', async ({
  page,
}) => {
  await observeRenderer(page);
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Try Lysozyme' }).click();
  const viewer = page.locator('[data-annotation-viewer="ready"]');
  await expect(viewer).toBeVisible();
  await page.evaluate(() => {
    const scene = (window as any).__colorScenes.annotation;
    scene.rotate(28, 'y');
    scene.render();
  });
  const before = await camera(page, 'annotation');
  for (const representation of ['Cartoon', 'Sticks']) {
    await page
      .getByRole('combobox', { name: 'Representation', exact: true })
      .selectOption(representation);
    const style = representation === 'Cartoon' ? 'cartoon' : 'stick';
    await viewer
      .getByRole('combobox', { name: 'Color By', exact: true })
      .selectOption('Chainbow');
    await page.mouse.move(1, 1);
    const rainbow = await atoms(page, 'annotation', style);
    expect(rainbow[0].color).toBe(0x568bff);
    expect(rainbow.at(-1).color).toBe(0xff6b66);
    expect(new Set(rainbow.map((a) => a.color)).size).toBeGreaterThan(50);
    await viewer
      .getByRole('combobox', { name: 'Color By', exact: true })
      .selectOption('Residue Chemistry');
    const chemistry = await atoms(page, 'annotation', style);
    expect(chemistry.find((a) => a.resn === 'ASP').color).toBe(0xf48b9e);
    expect(chemistry.find((a) => a.resn === 'LYS').color).toBe(0x91a8ff);
    await page
      .getByLabel('Protein Sequence', { exact: true })
      .getByRole('button')
      .last()
      .click();
    await page.mouse.move(1, 1);
    for (const mode of [
      'Secondary Structure',
      'Chain',
      'Chainbow',
      'Annotations',
    ]) {
      await viewer
        .getByRole('combobox', { name: 'Color By', exact: true })
        .selectOption(mode);
      expect((await atoms(page, 'annotation', style)).at(-1).color).toBe(
        0xffc473
      );
    }
    await page
      .getByRole('button', { name: 'Clear Selection', exact: true })
      .click();
  }
  await viewer
    .getByRole('combobox', { name: 'Color By', exact: true })
    .selectOption('Secondary Structure');
  const secondary = await atoms(page, 'annotation', 'stick');
  expect(secondary.some((a) => a.color === 0xb79bff)).toBe(true);
  expect(secondary.some((a) => a.color === 0x6dd7c4)).toBe(true);
  expect(await camera(page, 'annotation')).toEqual(before);
  await page
    .getByRole('combobox', { name: 'Representation', exact: true })
    .selectOption('Cartoon');
  await viewer
    .getByRole('combobox', { name: 'Color By', exact: true })
    .selectOption('Chainbow');
  await viewer.screenshot({ path: '.local/chainbow-annotation.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    viewer.getByRole('combobox', { name: 'Color By', exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  ).toBe(true);
});

test('comparison palettes follow each loaded chain and keep alignment, visibility, and highlights intact', async ({
  page,
}) => {
  await observeRenderer(page);
  await page.route('**/api/protein-annotations?kind=reference&**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Offline test fixture' }),
    })
  );
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Compare RfaH States' }).click();
  const viewer = page.locator('[data-comparison-viewer="ready"]');
  await expect(viewer).toBeVisible();
  await page.evaluate(() => {
    const scene = (window as any).__colorScenes.comparison;
    scene.rotate(28, 'y');
    scene.render();
  });
  const before = await camera(page, 'comparison');
  await viewer
    .getByRole('combobox', { name: 'Color By', exact: true })
    .selectOption('Chainbow');
  await page.mouse.move(1, 1);
  const rainbow = await atoms(page, 'comparison');
  for (const model of [0, 1]) {
    const chain = rainbow.filter((a) => a.model === model);
    expect(chain[0].color).toBe(0x568bff);
    expect(chain.at(-1).color).toBe(0xff6b66);
    expect(new Set(chain.map((a) => a.color)).size).toBeGreaterThan(20);
  }
  await viewer.screenshot({ path: '.local/chainbow-comparison.png' });
  await page.getByRole('button', { name: 'Select Largest Difference' }).click();
  // End the chart's transient active residue before inspecting persistent selection.
  await page
    .getByRole('img', {
      name: 'Alpha carbon distance for each aligned residue, in angstroms',
      exact: true,
    })
    .hover();
  await page.mouse.move(1, 1);
  for (const mode of [
    'Residue Chemistry',
    'Secondary Structure',
    'Difference',
    'Structure',
    'Chainbow',
  ]) {
    await viewer
      .getByRole('combobox', { name: 'Color By', exact: true })
      .selectOption(mode);
    const colored = await atoms(page, 'comparison');
    for (const model of [0, 1])
      expect(
        colored.filter((a) => a.model === model && a.color === 0xffdc76)
      ).toHaveLength(1);
  }
  await page
    .getByRole('button', { name: 'Protein 2 Only', exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      (window as any).__colorScenes.comparison
        .selectedAtoms({ model: 0 })
        .every((a: any) => Object.keys(a.style).length === 0)
    )
  ).toBe(true);
  await page.getByRole('button', { name: 'Overlay', exact: true }).click();
  expect(await camera(page, 'comparison')).toEqual(before);
  await page.setViewportSize({ width: 390, height: 844 });
  await viewer.screenshot({ path: '.local/chainbow-comparison-mobile.png' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  ).toBe(true);
});
