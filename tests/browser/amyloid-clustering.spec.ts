import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('Pyodide HDBSCAN reproduces native partitions on synthetic tied, noisy, and degenerate pools', async ({
  page,
}) => {
  test.setTimeout(120000);
  const fixtures = JSON.parse(
    await readFile('tests/fixtures/amyloid-cluster-parity.json', 'utf8')
  );
  await page.goto('/tools/amyloid-inspector');
  const results = await page.evaluate(async (cases) => {
    const source = `
      import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/pyodide.mjs';
      self.onmessage = async ({data}) => {
        try {
          const python = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/' });
          await python.loadPackage(['numpy','scikit-learn']);
          python.unpackArchive(await (await fetch(data.origin + '/tools/amyloid-device/v1/pipeline.zip')).arrayBuffer(), 'zip', { extractDir: '/pipeline' });
          python.globals.set('_cases', JSON.stringify(data.cases));
          const output = await python.runPythonAsync(\`import sys,json,numpy as np
sys.path.insert(0, '/pipeline')
from analysis.browser_clustering import sklearn_labels
json.dumps([sklearn_labels(np.array(c['distances']), c['settings']).tolist() for c in json.loads(_cases)])\`);
          postMessage({result:JSON.parse(output)});
        } catch(error) { postMessage({error:String(error)}); }
      };`;
    const url = URL.createObjectURL(
      new Blob([source], { type: 'text/javascript' })
    );
    const worker = new Worker(url, { type: 'module' });
    try {
      return await new Promise<number[][]>((resolve, reject) => {
        worker.onmessage = ({ data }) =>
          data.error ? reject(new Error(data.error)) : resolve(data.result);
        worker.onerror = (event) => reject(new Error(event.message));
        worker.postMessage({ cases, origin: location.origin });
      });
    } finally {
      worker.terminate();
      URL.revokeObjectURL(url);
    }
  }, fixtures.cases);
  const membership = (labels: number[]) =>
    labels.map((label, i) =>
      labels.map((other, j) => (label < 0 ? i === j : label === other))
    );
  for (const [index, fixture] of fixtures.cases.entries()) {
    expect(
      results[index].map((label) => label < 0),
      fixture.name
    ).toEqual(fixture.native_labels.map((label) => label < 0));
    expect(membership(results[index]), fixture.name).toEqual(
      membership(fixture.native_labels)
    );
  }
});

test('progress reports actual completed stages and remains readable with reduced motion', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tools/amyloid-inspector');
  const input = page.getByLabel('Choose Structures', { exact: true });
  await expect(input).toBeEnabled();
  await input.setInputFiles('public/tools/amyloid-example/2beg.pdb');
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  const bar = page.getByRole('progressbar', { name: 'Analysis Progress' });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-valuenow', /^(16|33|50|66|83)$/, {
    timeout: 60000,
  });
  await expect(page.getByText(/Elapsed$/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download Local Reports', exact: true })
  ).toBeVisible({ timeout: 60000 });
  await expect(bar).toHaveAttribute('aria-valuenow', '100');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
});
