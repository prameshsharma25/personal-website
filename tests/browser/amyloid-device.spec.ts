import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const fixture = (name: string) =>
  path.resolve('public/tools/amyloid-example', name);

test('on-device mode is default, loads no engine until asked, and contacts no analysis service', async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tools/amyloid-inspector');
  await expect(
    page.getByRole('button', { name: 'On My Device', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByLabel('Choose Structures', { exact: true })
    .setInputFiles(fixture('2beg.pdb'));
  await expect(page.getByText('Structure Only', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Analyze On My Device', exact: true })
  ).toBeEnabled();
  expect(
    requests.filter((url) =>
      /amyloid-config|\/health|\/jobs|pyodide|amyloid-device/.test(url)
    )
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('real browser calculations match native Python reports and export verified portable artifacts', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  const writes: string[] = [];
  const services: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
    if (/\/api\/amyloid|:8001|\/jobs\//.test(request.url()))
      services.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tools/amyloid-inspector');
  await page.getByLabel('Choose Structures', { exact: true }).setInputFiles([
    {
      name: '2beg.pdb',
      mimeType: 'text/plain',
      buffer: await readFile(fixture('2beg.pdb')),
    },
    {
      name: '6qjh.pdb',
      mimeType: 'text/plain',
      buffer: await readFile(fixture('6qjh.pdb')),
    },
    {
      name: '2beg.cif',
      mimeType: 'text/plain',
      buffer: await readFile(path.resolve('tests/fixtures/amyloid-2beg.cif')),
    },
    {
      name: 'invalid.pdb',
      mimeType: 'text/plain',
      buffer: Buffer.from('not coordinates\n'),
    },
  ]);
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Download Local Reports', exact: true })
  ).toBeVisible({ timeout: 150000 });
  await expect(
    page.getByText('SHA-256 Matched', { exact: true })
  ).toBeVisible();
  const table = page.getByRole('table', {
    name: 'On-Device Structure Results',
  });
  await expect(table).toContainText('Amyloid Like High Support');
  await expect(table).toContainText('Geometry Not Directly Assessable');
  await expect(
    table
      .getByRole('row')
      .filter({ hasText: 'invalid.pdb' })
      .getByRole('button', { name: 'Inspect' })
  ).toBeDisabled();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download Local Reports', exact: true })
    .click();
  const archive = await download;
  expect(archive.suggestedFilename()).toBe('amyloid-device-results.zip');
  const destination = testInfo.outputPath('device-results.zip');
  await archive.saveAs(destination);
  const output = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `
import zipfile,json,hashlib,sys
with zipfile.ZipFile(sys.argv[1]) as z:
    checks=json.loads(z.read('SHA256.json'))
    assert set(checks)==set(z.namelist())-{'SHA256.json'}
    for name,digest in checks.items(): assert hashlib.sha256(z.read(name)).hexdigest()==digest,name
    result=json.loads(z.read('results.json'))
    for entry in result['structures']:
        if entry['state']=='complete':
            files=entry['files']; report=json.loads(z.read(files['report']))
            assert report['source_manifest']['sha256']==hashlib.sha256(z.read(files['manifest'])).hexdigest()
            assert entry['source_sha256']==hashlib.sha256(z.read(files['structure'])).hexdigest()
    print(json.dumps({'result':result,'reports':[json.loads(z.read(e['files']['report'])) for e in result['structures'] if e['state']=='complete']}))
`,
        destination,
      ],
      { encoding: 'utf8' }
    )
  );
  expect(output.result.clustering_status).toBe('not_run_on_device');
  expect(
    output.result.structures.map((model: { state: string }) => model.state)
  ).toEqual(['complete', 'complete', 'complete', 'failed']);
  let numeric = 0;
  function compare(actual: unknown, expected: unknown) {
    if (typeof expected === 'number') {
      expect(typeof actual).toBe('number');
      expect(Math.abs(Number(actual) - expected)).toBeLessThanOrEqual(
        1e-9 * Math.max(1, Math.abs(expected))
      );
      numeric++;
    } else if (Array.isArray(expected)) {
      expect(Array.isArray(actual)).toBe(true);
      expect((actual as unknown[]).length).toBe(expected.length);
      expected.forEach((value, index) => compare(actual[index], value));
    } else if (expected && typeof expected === 'object') {
      expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
      for (const [key, value] of Object.entries(expected))
        compare(actual[key], value);
    } else expect(actual).toEqual(expected);
  }
  for (const [index, name] of ['2beg', '6qjh', '2beg'].entries()) {
    const native = JSON.parse(
      await readFile(fixture(`${name}.gates.json`), 'utf8')
    );
    for (const field of [
      'quality_gate',
      'component_features',
      'positive_reference_gates',
      'soluble_intrachain_core',
      'interpretation_scope',
    ])
      compare(output.reports[index][field], native[field]);
  }
  expect(numeric).toBeGreaterThan(240);
  await table
    .getByRole('row')
    .filter({ hasText: '6qjh.pdb' })
    .getByRole('button', { name: 'Inspect' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Geometry Not Directly Assessable' })
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('device-mobile.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Clear Local Results', exact: true })
    .click();
  await expect(table).toHaveCount(0);
  await expect(page.locator('[data-viewer]')).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(services).toEqual([]);
  expect(errors).toEqual([]);
});

test('engine failure is recoverable, cancellation terminates the worker, and navigation stays responsive', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.route('**/tools/amyloid-device/v1/engine.json', (route) =>
    route.abort()
  );
  await page.goto('/tools/amyloid-inspector');
  await page
    .getByLabel('Choose Structures', { exact: true })
    .setInputFiles(fixture('2beg.pdb'));
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await expect(page.locator('main [role=alert]')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Analyze On My Device', exact: true })
  ).toBeEnabled();
  await page.unroute('**/tools/amyloid-device/v1/engine.json');
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Calculating Descriptors',
    { timeout: 60000 }
  );
  await page
    .getByRole('button', { name: 'Open Existing Reports', exact: true })
    .click();
  await expect(
    page.getByLabel('Choose Structure Or Report Files')
  ).toBeVisible();
  await page.getByRole('button', { name: 'On My Device', exact: true }).click();
  await page
    .getByRole('button', { name: 'Cancel Analysis', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Cancelled');
  await expect(
    page.getByRole('button', { name: 'Analyze On My Device', exact: true })
  ).toBeEnabled();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Download Local Reports', exact: true })
  ).toBeVisible({ timeout: 60000 });
});
