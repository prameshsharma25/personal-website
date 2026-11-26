import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const reference = JSON.parse(
  fs.readFileSync('public/tools/protein-annotations/P00698.json', 'utf8')
);
const pdb = fs.readFileSync(
  'public/tools/protein-annotations/1LYZ.pdb',
  'utf8'
);
// Real UniProt sequence; annotation lists are deliberately omitted from this workflow fixture.
const fubp1 = JSON.parse(
  fs.readFileSync('tests/fixtures/protein-annotations/Q96AE4.json', 'utf8')
);
test('lysozyme and FUBP1 are clearly distinguished until the user opens the new protein', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/api/protein-annotations?**', (route) => {
    requests.push(route.request().url());
    return route.fulfill({ json: fubp1 });
  });
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Try Lysozyme' }).click();
  await page
    .getByLabel('Protein Sequence', { exact: true })
    .getByRole('button', { name: 'GLU 35, A, Reference 53', exact: true })
    .click();
  await page.getByText('Save A Region And Notes', { exact: true }).click();
  await page.getByLabel('Region Name', { exact: true }).fill('Lysozyme Region');
  await page
    .getByLabel('Research Notes', { exact: true })
    .fill('Keep this note while comparing references.');
  await page.getByRole('button', { name: 'Save Selected Region' }).click();
  const context = page.getByLabel('Loaded Protein And Reference', {
    exact: true,
  });
  await page.getByLabel('UniProt Accession', { exact: true }).fill('Q96AE4');
  await expect(context).toContainText('1LYZ.pdb');
  await expect(context).toContainText('P00698');
  expect(requests).toHaveLength(0);
  await page
    .getByRole('button', { name: 'Load Annotations', exact: true })
    .click();
  await expect(context).toContainText('Q96AE4');
  await expect(context).toContainText('1LYZ.pdb');
  await expect(
    page.getByText('Reference Mapping Needs Review', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(
      'The loaded protein does not closely match this reference.',
      { exact: false }
    )
  ).toBeVisible();
  await expect(
    page
      .getByRole('complementary', { name: 'Region Annotations' })
      .locator('article')
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: '1LYZ.pdb', exact: true })
  ).toBeVisible();
  await expect(page.getByText('1 Selected', { exact: true })).toBeVisible();
  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Review' }).click();
  let exported = JSON.parse(
    fs.readFileSync(await (await download).path(), 'utf8')
  );
  expect(exported.input.name).toBe('1LYZ.pdb');
  expect(exported.reference.accession).toBe('Q96AE4');
  expect(exported.savedRegions[0].notes).toBe(
    'Keep this note while comparing references.'
  );
  expect(exported.mapping.usable).toBe(false);
  await page
    .getByRole('button', { name: 'Open Reference Protein', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: fubp1.name, exact: true })
  ).toBeVisible();
  await expect(context).not.toContainText('1LYZ.pdb');
  await expect(context).toContainText('644 Residues');
  await expect(
    page.getByText('Exact Sequence Match', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByLabel('Protein Sequence', { exact: true }).getByRole('button')
  ).toHaveCount(644);
  await expect(page.locator('[data-annotation-viewer]')).toHaveCount(0);
  await expect(page.getByText('0 Selected', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Research Notes', { exact: true })).toHaveValue(
    ''
  );
  await expect(
    page.getByRole('button', { name: 'Load Existing AlphaFold Structure' })
  ).toBeEnabled();
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Review' }).click();
  exported = JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
  expect(exported.input.name).toBe(fubp1.name);
  expect(exported.input.origin).toContain('UniProt Q96AE4');
  expect(exported.reference.accession).toBe('Q96AE4');
  expect(exported.mapping.exact).toBe(true);
  expect(exported.savedRegions).toEqual([]);
  expect(requests).toHaveLength(1);
});
test('opening a new accession preserves the current protein on failure and replaces it on success', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let fail = true;
  await page.route('**/api/protein-annotations?**', (route) => {
    expect(new URL(route.request().url()).searchParams.get('id')).toBe(
      'Q96AE4'
    );
    return route.fulfill(
      fail
        ? { status: 502, json: { error: 'Reference temporarily unavailable.' } }
        : { json: fubp1 }
    );
  });
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Try Lysozyme' }).click();
  await page
    .getByLabel('Protein Sequence', { exact: true })
    .getByRole('button')
    .first()
    .click();
  await page.getByLabel('UniProt Accession', { exact: true }).fill('Q96AE4');
  await page
    .getByRole('button', { name: 'Open As New Protein', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Protein Annotation Explorer', exact: true })
      .getByRole('alert')
  ).toHaveText('Reference temporarily unavailable.');
  await expect(
    page.getByRole('heading', { name: '1LYZ.pdb', exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('Loaded Protein And Reference')).toContainText(
    'P00698'
  );
  await expect(page.getByText('1 Selected', { exact: true })).toBeVisible();
  fail = false;
  await page
    .getByRole('button', { name: 'Open As New Protein', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: fubp1.name, exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Exact Sequence Match', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('0 Selected', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Loaded Protein And Reference')).toContainText(
    'Q96AE4'
  );
  await expect(
    page.getByRole('button', { name: 'Load Existing AlphaFold Structure' })
  ).toBeEnabled();
  await expect(
    page
      .getByRole('region', { name: 'Protein Annotation Explorer', exact: true })
      .getByRole('alert')
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    )
  ).toBe(true);
});
test('example links sequence, real WebGL selection, annotations, notes and exported provenance', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /hydrat|server rendered HTML/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.goto('/tools');
  await page.getByRole('link', { name: 'Open Annotation Explorer' }).click();
  await page.getByRole('button', { name: 'Try Lysozyme' }).click();
  await expect(page.locator('[data-annotation-viewer="ready"]')).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.getByText('100% Sequence Identity', { exact: false })
  ).toBeVisible();
  const sequence = page.getByLabel('Protein Sequence', { exact: true });
  await sequence
    .getByRole('button', { name: 'GLU 35, A, Reference 53', exact: true })
    .click();
  await expect(page.getByText('1 Selected', { exact: true })).toBeVisible();
  const panel = page.getByRole('complementary', { name: 'Region Annotations' });
  await panel.getByLabel('Annotation Type').selectOption('Active site');
  await expect(panel.locator('article')).toHaveCount(1);
  await expect(
    panel.getByText('Reference Residues: 53', { exact: true })
  ).toBeVisible();
  await sequence
    .getByRole('button', { name: 'ASN 37, A, Reference 55', exact: true })
    .click({ modifiers: ['Shift'] });
  await expect(page.getByText('3 Selected', { exact: true })).toBeVisible();
  await page.getByText('Save A Region And Notes', { exact: true }).click();
  await page
    .getByLabel('Region Name', { exact: true })
    .fill('Catalytic Neighborhood');
  await page
    .getByLabel('Research Notes', { exact: true })
    .fill('Compare this region across conformations.');
  await page.getByRole('button', { name: 'Save Selected Region' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Review' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('protein-annotation-review.json');
  const data = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  expect(data.selectedResidues).toHaveLength(3);
  expect(data.mapping.positions[34]).toBe(53);
  expect(data.reference.annotations.some((a) => a.source === 'InterPro')).toBe(
    true
  );
  expect(data.savedRegions[0].notes).toContain('Compare this region');
  // Use the real renderer's projection to click a visible atom, exercising its picking callback.
  await page
    .getByRole('button', { name: 'Clear Selection', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Representation', exact: true })
    .selectOption('Sticks');
  const canvas = page.locator('[data-annotation-viewer] canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  // Click through the central rendered molecule until the real picking callback selects a residue.
  let picked = false;
  for (const x of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    for (const y of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      if (await page.getByText('1 Selected', { exact: true }).isVisible()) {
        picked = true;
        break;
      }
    }
    if (picked) break;
  }
  expect(picked).toBe(true);
  expect(errors).toEqual([]);
});
test('uploaded files stay local and mismatched references cannot annotate them', async ({
  page,
}) => {
  const requests: { url: string; body: string | null }[] = [];
  await page.route('**/api/protein-annotations?**', (route) => {
    requests.push({
      url: route.request().url(),
      body: route.request().postData(),
    });
    return route.fulfill({ json: reference });
  });
  await page.goto('/tools/protein-annotations');
  await page.getByLabel('Upload Protein', { exact: true }).setInputFiles({
    name: 'private-structure.pdb',
    mimeType: 'text/plain',
    buffer: Buffer.from(pdb),
  });
  await expect(
    page.getByRole('heading', { name: 'private-structure.pdb', exact: true })
  ).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByLabel('UniProt Accession', { exact: true }).fill('P00698');
  await page
    .getByRole('button', { name: 'Load Annotations', exact: true })
    .click();
  await expect(
    page.getByText('Aligned To Reference', { exact: true })
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].body).toBeNull();
  expect(requests[0].url).not.toContain('private');
  await page.getByLabel('Upload Protein', { exact: true }).setInputFiles({
    name: 'unrelated.fasta',
    mimeType: 'text/plain',
    buffer: Buffer.from('>Unrelated\nWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW'),
  });
  await page.getByLabel('UniProt Accession', { exact: true }).fill('P00698');
  await page
    .getByRole('button', { name: 'Load Annotations', exact: true })
    .click();
  await expect(
    page.getByText('Reference Mapping Needs Review', { exact: true })
  ).toBeVisible();
  await expect(
    page
      .getByRole('complementary', { name: 'Region Annotations' })
      .locator('article')
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Load Existing AlphaFold Structure' })
  ).toBeDisabled();
});
test('sequence drag, chain switches, insertion codes and mobile rendering remain usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Try Lysozyme' }).click();
  const sequence = page.getByLabel('Protein Sequence', { exact: true });
  await sequence.scrollIntoViewIfNeeded();
  const a = await sequence.getByRole('button').nth(1).boundingBox(),
    b = await sequence.getByRole('button').nth(3).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByText('3 Selected', { exact: true })).toBeVisible();
  const rows = pdb
    .split('\n')
    .filter((l) => l.startsWith('ATOM'))
    .slice(0, 25);
  const second = rows.map((l) => l.slice(0, 21) + 'B' + l.slice(22));
  await page.getByLabel('Upload Protein', { exact: true }).setInputFiles({
    name: 'chains.pdb',
    mimeType: 'text/plain',
    buffer: Buffer.from(rows.join('\n') + '\n' + second.join('\n')),
  });
  await page
    .getByRole('combobox', { name: 'Chain', exact: true })
    .selectOption('B');
  const residue = sequence.getByRole('button').first();
  await residue.focus();
  await page.keyboard.press('Enter');
  await expect(residue).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('combobox', { name: 'Chain', exact: true })
    .selectOption('A');
  await expect(page.getByText('0 Selected', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page.screenshot({
    path: '.local/protein-annotations-mobile.png',
    fullPage: true,
  });
});
test('API outages and unavailable WebGL preserve the sequence and evidence', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (typeof OffscreenCanvas !== 'undefined') {
      const originalOffscreen = OffscreenCanvas.prototype.getContext;
      OffscreenCanvas.prototype.getContext = function (type, ...args) {
        if (String(type).includes('webgl')) return null;
        return originalOffscreen.call(this, type, ...args);
      } as typeof originalOffscreen;
    }
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).includes('webgl')) return null;
      return original.call(this, type, ...args);
    } as typeof original;
  });
  await page.route('**/api/protein-annotations?**', (route) =>
    route.fulfill({
      status: 502,
      json: { error: 'The annotation provider is temporarily unavailable.' },
    })
  );
  await page.goto('/tools/protein-annotations');
  await page.getByRole('button', { name: 'Try Lysozyme' }).click();
  await expect(
    page.getByText('3D rendering is unavailable.', { exact: false })
  ).toBeVisible();
  await page
    .getByLabel('Protein Sequence', { exact: true })
    .getByRole('button', { name: 'GLU 35, A, Reference 53', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Load Annotations', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Protein Annotation Explorer', exact: true })
      .getByRole('alert')
  ).toContainText('temporarily unavailable');
  await expect(
    page.getByRole('button', { name: 'Export Review' })
  ).toBeEnabled();
  await expect(page.getByText('1 Selected', { exact: true })).toBeVisible();
});
test('existing AlphaFold retrieval verifies sequence identity and never substitutes a different model', async ({
  page,
}) => {
  await page.route('**/api/protein-annotations?**', (route) =>
    route.fulfill({
      json: route.request().url().includes('kind=model')
        ? {
            name: 'model.pdb',
            text: pdb,
            sequence: 'WRONG',
            label: 'AlphaFold DB',
          }
        : reference,
    })
  );
  await page.goto('/tools/protein-annotations');
  await page.getByLabel('UniProt Accession', { exact: true }).fill('P00698');
  await page
    .getByRole('button', { name: 'Load Annotations', exact: true })
    .click();
  await expect(
    page.getByText('Exact Sequence Match', { exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Load Existing AlphaFold Structure' })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Protein Annotation Explorer', exact: true })
      .getByRole('alert')
  ).toContainText('different sequence version');
  await expect(
    page.getByRole('heading', { name: 'Sequence Ready', exact: true })
  ).toBeVisible();
});
test('route has discoverable metadata and server API validates requests', async ({
  request,
  browser,
}) => {
  expect((await request.post('/api/protein-annotations')).status()).toBe(405);
  expect(
    (
      await request.get('/api/protein-annotations?kind=reference&id=../secret')
    ).status()
  ).toBe(400);
  expect(
    (
      await request.get('/api/protein-annotations?kind=arbitrary&id=P00698')
    ).status()
  ).toBe(400);
  expect(await (await request.get('/sitemap.xml')).text()).toContain(
    '/tools/protein-annotations'
  );
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(
    (process.env.TEST_BASE_URL || 'http://127.0.0.1:3817') +
      '/tools/protein-annotations'
  );
  await expect(
    page.getByText('Enable JavaScript to open proteins', { exact: false })
  ).toBeVisible();
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://prameshsharma.com/tools/protein-annotations'
  );
  await context.close();
});
