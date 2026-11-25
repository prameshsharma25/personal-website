import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

async function instrument(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8 });
    const Original = window.Worker;
    (window as any).__descriptorTest = {
      workers: [],
      samples: [],
      result: null,
    };
    window.Worker = class extends Original {
      record: any;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        const state = (window as any).__descriptorTest;
        this.record = { name: options?.name, terminated: false };
        state.workers.push(this.record);
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'diagnostics') state.samples.push(data.diagnostics);
          if (data.type === 'complete') state.result = data.result;
        });
      }
      terminate() {
        this.record.terminated = true;
        super.terminate();
      }
    };
  });
}

test('parallel descriptors preserve PDB/mmCIF identity and partial failures with a verified download', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  await instrument(page);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
  });
  await page.goto('/tools/amyloid-inspector');
  await page
    .getByLabel('Save Progress On This Device', { exact: true })
    .uncheck();
  await page.getByLabel('Choose Structures', { exact: true }).setInputFiles([
    {
      name: 'a.pdb',
      mimeType: 'text/plain',
      buffer: await readFile('public/tools/amyloid-example/2beg.pdb'),
    },
    {
      name: 'broken.pdb',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a structure'),
    },
    {
      name: 'b.cif',
      mimeType: 'text/plain',
      buffer: await readFile('tests/fixtures/amyloid-2beg.cif'),
    },
    {
      name: 'c.pdb',
      mimeType: 'text/plain',
      buffer: await readFile('public/tools/amyloid-example/6qjh.pdb'),
    },
  ]);
  await page
    .getByRole('combobox', { name: 'Descriptor Workers', exact: true })
    .selectOption('4');
  await page.getByLabel('Compare And Cluster Structures').uncheck();
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Download Local Reports', exact: true })
  ).toBeVisible({ timeout: 150000 });
  const state = await page.evaluate(() => (window as any).__descriptorTest);
  expect(
    state.result.structures.map((item) => [item.id, item.filename, item.state])
  ).toEqual([
    ['model-001', 'a.pdb', 'complete'],
    ['model-002', 'broken.pdb', 'failed'],
    ['model-003', 'b.cif', 'complete'],
    ['model-004', 'c.pdb', 'complete'],
  ]);
  expect(state.result.descriptor_execution.workers).toBe(4);
  expect(
    state.workers.filter((item) => item.name === 'amyloid-descriptors')
  ).toHaveLength(4);
  expect(state.workers.every((item) => item.terminated)).toBe(true);
  expect(
    state.samples.some((item) => item.descriptorPool?.peakActive === 4)
  ).toBe(true);
  expect(
    state.samples.some(
      (item) => item.stage?.phase === 'descriptors' && item.stage.failed === 1
    )
  ).toBe(true);
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download Local Reports', exact: true })
    .click();
  const archive = await download;
  expect(archive.suggestedFilename()).toBe('amyloid-device-results.zip');
  const destination = testInfo.outputPath('partial-descriptors.zip');
  await archive.saveAs(destination);
  execFileSync('python3', ['scripts/check-amyloid-benchmark.py', destination]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  expect(writes).toEqual([]);
});

test('cancelling descriptors terminates every runtime and allows a fresh single worker run', async ({
  page,
}) => {
  test.setTimeout(180000);
  await instrument(page);
  const bytes = await readFile('public/tools/amyloid-example/2beg.pdb');
  await page.goto('/tools/amyloid-inspector');
  await page
    .getByLabel('Save Progress On This Device', { exact: true })
    .uncheck();
  const files = Array.from({ length: 12 }, (_, i) => ({
    name: `cancel-${i}.pdb`,
    mimeType: 'text/plain',
    buffer: bytes,
  }));
  await page
    .getByLabel('Choose Structures', { exact: true })
    .setInputFiles(files);
  await page
    .getByRole('combobox', { name: 'Descriptor Workers', exact: true })
    .selectOption('4');
  await page.getByLabel('Compare And Cluster Structures').uncheck();
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as any).__descriptorTest.samples.some(
            (item) => item.descriptorPool?.active === 4
          )
        ),
      { timeout: 120000 }
    )
    .toBe(true);
  await expect(
    page.getByRole('combobox', { name: 'Descriptor Workers', exact: true })
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Cancel Analysis', exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      (window as any).__descriptorTest.workers.every((item) => item.terminated)
    )
  ).toBe(true);
  await page
    .getByLabel('Choose Structures', { exact: true })
    .setInputFiles(files.slice(0, 1));
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Download Local Reports', exact: true })
  ).toBeVisible({ timeout: 60000 });
  const result = await page.evaluate(
    () => (window as any).__descriptorTest.result
  );
  expect(result.descriptor_execution.workers).toBe(1);
  expect(result.structures).toHaveLength(1);
  expect(result.structures[0].state).toBe('complete');
});
