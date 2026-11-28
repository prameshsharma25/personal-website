import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { parseProteinStructure } from '../../lib/protein-input';
const pdb = fs.readFileSync(
  'public/tools/protein-annotations/1LYZ.pdb',
  'utf8'
);
const reference = JSON.parse(
  fs.readFileSync('public/tools/protein-annotations/P00698.json', 'utf8')
);
const noRefPdb = pdb
  .split('\n')
  .filter((line) => !line.startsWith('DBREF'))
  .join('\n');
const secondReference = {
  ...reference,
  accession: 'P12345',
  name: 'Second Reference',
  annotations: reference.annotations.map((a) => ({
    ...a,
    id: `second-${a.id}`,
    description: `Second protein: ${a.description}`,
  })),
};
const card = (page: Page, n: number) =>
  page.getByRole('group', { name: `Protein ${n} Input`, exact: true });
const panel = (page: Page) =>
  page.getByRole('complementary', { name: 'Region Annotations' });
async function model(page: Page) {
  await page.route('**/api/protein-annotations?kind=model&*', (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    return route.fulfill({
      json: {
        text: noRefPdb,
        sequence: parseProteinStructure(pdb, 'model.pdb')
          .chains[0].residues.map((r) => r.letter)
          .join(''),
        url: `https://alphafold.ebi.ac.uk/files/AF-${id}-F1-model_v6.pdb`,
      },
    });
  });
}
async function open(page: Page) {
  await page.goto('/tools/protein-annotations');
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
}
async function accession(page: Page, slot: number, id: string) {
  await card(page, slot)
    .getByLabel(`UniProt Accession For Protein ${slot}`)
    .fill(id);
  await card(page, slot)
    .getByRole('button', { name: `Load Protein ${slot}`, exact: true })
    .click();
}
async function upload(
  page: Page,
  slot: number,
  text: string,
  name = 'upload.pdb'
) {
  await page
    .getByLabel(slot === 1 ? 'Upload Protein' : 'Comparison Structure', {
      exact: true,
    })
    .setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
}
async function inspect(page: Page, slot: number) {
  await page
    .getByRole('button', { name: `Inspect Protein ${slot}`, exact: true })
    .click();
}

test('both accession inputs load annotations concurrently without waiting for alignment or manual inspection', async ({
  page,
}) => {
  const requests: string[] = [];
  let first!: () => void, second!: () => void;
  const gates = {
    P00698: new Promise<void>((resolve) => (first = resolve)),
    P12345: new Promise<void>((resolve) => (second = resolve)),
  };
  await model(page);
  await page.route(
    '**/api/protein-annotations?kind=reference&*',
    async (route) => {
      const id = new URL(route.request().url()).searchParams.get('id')!;
      requests.push(id);
      await gates[id];
      await route.fulfill({
        json: id === 'P00698' ? reference : secondReference,
      });
    }
  );
  try {
    await open(page);
    await accession(page, 1, 'P00698');
    await accession(page, 2, 'P12345');
    await expect(card(page, 1)).toContainText('Loading Protein 1 Annotations');
    await expect(card(page, 2)).toContainText('Loading Protein 2 Annotations');
    await expect(
      page.locator('[data-comparison-viewer="ready"]')
    ).toBeVisible();
    expect(requests.sort()).toEqual(['P00698', 'P12345']);
    second();
    await inspect(page, 2);
    await expect(panel(page)).toContainText('P12345');
    await expect(panel(page)).toContainText('Second protein:');
    await expect(card(page, 1)).toContainText('Loading Protein 1 Annotations');
    first();
    await inspect(page, 1);
    await expect(panel(page)).toContainText('P00698');
    await expect(panel(page)).not.toContainText('Second protein:');
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download Comparison Report' })
      .click();
    const report = JSON.parse(
      fs.readFileSync(await (await download).path(), 'utf8')
    );
    expect(report.reference.accession).toBe('P00698');
    expect(report.comparisonReference.accession).toBe('P12345');
    expect(
      report.pairs.some(
        (p) => p.primaryAnnotations.length && p.comparisonAnnotations.length
      )
    ).toBe(true);
  } finally {
    first();
    second();
  }
});

test('entering comparison loads known PDB references and respects chain identity without guessing unknown files', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/api/protein-annotations?kind=reference&*', (route) => {
    const id = new URL(route.request().url()).searchParams.get('id')!;
    requests.push(id);
    return route.fulfill({
      json: id === 'P00698' ? reference : secondReference,
    });
  });
  await page.goto('/tools/protein-annotations');
  await upload(page, 1, pdb);
  await expect(panel(page)).toContainText('Enter a UniProt accession');
  expect(requests).toEqual([]);
  await page
    .getByRole('button', { name: 'Compare Structures', exact: true })
    .click();
  await expect(panel(page)).toContainText('P00698');
  await upload(page, 2, noRefPdb, 'AF-P12345.pdb');
  await inspect(page, 2);
  await expect(panel(page)).toContainText('Enter a UniProt accession');
  expect(requests).toEqual(['P00698']);
  const lines = pdb.split('\n').filter((l) => l.startsWith('ATOM'));
  const refA = pdb.split('\n').find((l) => l.startsWith('DBREF '))!;
  const refB =
    refA.slice(0, 12) + 'B' + refA.slice(13).replace('P00698', 'P12345');
  await upload(
    page,
    2,
    [
      refA,
      refB,
      ...lines,
      ...lines.map((l) => l.slice(0, 21) + 'B' + l.slice(22)),
    ].join('\n')
  );
  await inspect(page, 2);
  await expect(panel(page)).toContainText('P00698');
  await page
    .getByRole('combobox', { name: 'Comparison Chain', exact: true })
    .selectOption('B');
  await expect(panel(page)).toContainText('P12345');
  await expect(panel(page)).toContainText('Chain B');
});

test('a delayed automatic response cannot overwrite a replacement structure', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await model(page);
  await page.route(
    '**/api/protein-annotations?kind=reference&*',
    async (route) => {
      await gate;
      await route.fulfill({ json: secondReference });
    }
  );
  try {
    await open(page);
    await upload(page, 1, noRefPdb);
    await accession(page, 2, 'P12345');
    await expect(card(page, 2)).toContainText('Loading Protein 2 Annotations');
    await upload(page, 2, noRefPdb, 'replacement.pdb');
    release();
    await inspect(page, 2);
    await expect(panel(page)).toContainText('replacement.pdb');
    await expect(panel(page)).toContainText('Enter a UniProt accession');
    await expect(panel(page)).not.toContainText('P12345');
    await expect(card(page, 2)).not.toContainText(
      'Loading Protein 2 Annotations'
    );
  } finally {
    release();
  }
});

test('annotation outages preserve the comparison and retry without recalculating it', async ({
  page,
}) => {
  let attempt = 0;
  await model(page);
  await page.route('**/api/protein-annotations?kind=reference&*', (route) =>
    ++attempt === 1
      ? route.fulfill({
          status: 503,
          json: { error: 'Temporary provider outage.' },
        })
      : route.fulfill({ json: reference })
  );
  await open(page);
  await upload(page, 1, noRefPdb);
  await accession(page, 2, 'P00698');
  await expect(card(page, 2).getByRole('alert')).toContainText(
    'Temporary provider outage'
  );
  await expect(page.locator('[data-comparison-viewer="ready"]')).toBeVisible();
  const metrics = await page.getByLabel('Comparison Metrics').innerText();
  await card(page, 2)
    .getByRole('button', { name: 'Retry Protein 2 Annotations', exact: true })
    .click();
  await inspect(page, 2);
  await expect(panel(page)).toContainText('P00698');
  await expect(card(page, 2).getByRole('alert')).toHaveCount(0);
  expect(await page.getByLabel('Comparison Metrics').innerText()).toBe(metrics);
  expect(attempt).toBe(2);
});

test('a manual reference overrides an automatic request and mismatched evidence remains withheld', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await model(page);
  await page.route(
    '**/api/protein-annotations?kind=reference&*',
    async (route) => {
      const id = new URL(route.request().url()).searchParams.get('id');
      if (id === 'P00698') {
        await gate;
        await route.fulfill({ json: reference });
      } else
        await route.fulfill({
          json: {
            ...secondReference,
            sequence: 'A'.repeat(reference.sequence.length),
          },
        });
    }
  );
  try {
    await open(page);
    await upload(page, 1, noRefPdb);
    await accession(page, 2, 'P00698');
    await inspect(page, 2);
    await page
      .getByText('Reference Annotations For Protein 2', { exact: true })
      .click();
    await page.getByLabel('UniProt Accession', { exact: true }).fill('P12345');
    await page
      .getByRole('button', { name: 'Load Annotations', exact: true })
      .click();
    await expect(panel(page)).toContainText('P12345');
    release();
    await expect(panel(page)).toContainText('Reference Mapping Needs Review');
    await expect(panel(page)).not.toContainText('Second protein:');
    await expect(
      panel(page).locator('a[href*="/uniprotkb/P00698/"]')
    ).toHaveCount(0);
    await expect(
      page.locator('[data-comparison-viewer="ready"]')
    ).toBeVisible();
  } finally {
    release();
  }
});
