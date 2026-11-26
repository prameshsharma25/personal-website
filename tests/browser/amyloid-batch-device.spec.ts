import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('125 structures are accepted by the page and real worker, show workload, and can be cancelled', async ({
  page,
}) => {
  test.setTimeout(120000);
  const original = await readFile('public/tools/amyloid-example/2beg.pdb');
  const inputs = Array.from({ length: 126 }, (_, index) => ({
    name: `capacity-${index + 1}.pdb`,
    mimeType: 'text/plain',
    buffer: original,
  }));
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
  });
  await page.goto('/tools/amyloid-inspector');
  // This exercises cancellation, not pausing a checkpointed run.
  await page
    .getByLabel('Save Progress On This Device', { exact: true })
    .uncheck();
  const input = page.getByLabel('Choose Structures', { exact: true });
  await expect(input).toBeEnabled();
  await input.setInputFiles(inputs);
  await expect(page.locator('main [role=alert]')).toContainText(
    'Select between 1 and 125 structures.'
  );
  await input.setInputFiles(inputs.slice(0, 125));
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
  await expect(page.getByText(/125 Structures Selected/)).toBeVisible();
  await expect(page.getByLabel('Comparison Workload')).toContainText(
    '15,625 MM-align'
  );
  await page.getByLabel('Compare And Cluster Structures').uncheck();
  await expect(page.getByLabel('Comparison Workload')).toHaveCount(0);
  await page.getByLabel('Compare And Cluster Structures').check();
  await page.getByLabel('Minimum Cluster Size', { exact: true }).fill('125');
  await page.getByLabel('Minimum Samples', { exact: true }).fill('124');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Calculating Descriptors',
    { timeout: 90000 }
  );
  await page
    .getByRole('button', { name: 'Cancel Analysis', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Cancelled');
  await expect(
    page.getByRole('button', { name: 'Analyze On My Device', exact: true })
  ).toBeEnabled();
  expect(writes).toEqual([]);
});

test('real browser batch passes the former 400-alignment ceiling', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  await page.addInitScript(() => {
    const original = window.Worker;
    (window as any).__diagnostics = [];
    window.Worker = class extends original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'diagnostics')
            (window as any).__diagnostics.push(data.diagnostics);
        });
      }
    };
  });
  // Small single-chain inputs exercise orchestration, not amyloid classification
  // or a capacity benchmark for 125 full assemblies.
  const original = await readFile(
    'public/tools/amyloid-example/2beg.pdb',
    'utf8'
  );
  const chain = Buffer.from(
    original
      .split(/\r?\n/)
      .filter((line) => /^(ATOM  |HETATM)/.test(line) && line[21] === 'A')
      .join('\n') + '\nEND\n'
  );
  expect(chain.length).toBeGreaterThan(0);
  await page.goto('/tools/amyloid-inspector');
  await page.getByLabel('Choose Structures', { exact: true }).setInputFiles(
    Array.from({ length: 21 }, (_, index) => ({
      name: `single-chain-${index + 1}.pdb`,
      mimeType: 'text/plain',
      buffer: chain,
    }))
  );
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  const diagnostics = page.getByRole('region', {
    name: 'Live Diagnostics',
    exact: true,
  });
  await expect(diagnostics).toBeVisible();
  await expect(
    diagnostics
      .locator('dt')
      .filter({ hasText: /^Interface Delay$/ })
      .locator('..')
      .locator('dd strong')
  ).toContainText(/ms|s/);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as any).__diagnostics.some(
            (sample) =>
              sample.stage?.phase === 'alignment' &&
              sample.stage.ratePerMinute > 0 &&
              sample.pythonMemoryBytes > 0
          )
        ),
      { timeout: 120000 }
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('live-diagnostics-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await diagnostics.screenshot({
    path: testInfo.outputPath('live-diagnostics-mobile.png'),
  });
  await expect(
    page.getByRole('button', { name: 'Download Local Reports', exact: true })
  ).toBeVisible({ timeout: 150000 });
  const downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download Local Reports', exact: true })
    .click();
  const destination = testInfo.outputPath('above-former-alignment-limit.zip');
  await (await downloaded).saveAs(destination);
  const output = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `
import json,zipfile,sys,hashlib
with zipfile.ZipFile(sys.argv[1]) as z:
    checks=json.loads(z.read('SHA256.json'))
    assert set(checks)==set(z.namelist())-{'SHA256.json'}
    for name,digest in checks.items(): assert hashlib.sha256(z.read(name)).hexdigest()==digest,name
    print(json.dumps({'result':json.loads(z.read('results.json')),'matrix':json.loads(z.read('group-001/distance_matrix.json')),'pairs':len([name for name in z.namelist() if name.startswith('pairs/')])}))
`,
        destination,
      ],
      { encoding: 'utf8' }
    )
  );
  expect(output.result.structures).toHaveLength(21);
  expect(
    output.result.structures.every((model) => model.state === 'complete')
  ).toBe(true);
  expect(output.result.groups).toHaveLength(1);
  expect(output.result.groups[0].clustering_status).not.toBe('failed');
  expect(output.result.groups[0].clustering_status).not.toBe(
    'insufficient_pool_size'
  );
  const clusterFilters = page.getByRole('group', {
    name: 'Filter Results By Cluster',
  });
  const noiseFilter = clusterFilters.getByRole('button', {
    name: 'Group 1 / Noise 21',
    exact: true,
  });
  await noiseFilter.click();
  await expect(noiseFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page
      .getByRole('table', { name: 'On-Device Structure Results', exact: true })
      .locator('tbody tr')
  ).toHaveCount(21);
  await expect(
    page.getByRole('region', { name: 'Browse Clusters' })
  ).toContainText('HDBSCAN did not assign these structures to a cluster.');
  await expect(
    page.getByRole('button', { name: 'Inspect Representative', exact: true })
  ).toHaveCount(0);
  await clusterFilters
    .getByRole('button', { name: 'All Structures 21', exact: true })
    .click();

  expect(output.matrix.distances).toHaveLength(21);
  expect(output.pairs).toBe(441);
  for (const row of output.matrix.distances) {
    expect(row).toHaveLength(21);
    for (const distance of row) expect(distance).toBeCloseTo(0, 5);
  }
  const samples = await page.evaluate(() => (window as any).__diagnostics);
  expect(
    samples.some(
      (sample) =>
        sample.stage?.phase === 'alignment' &&
        sample.stage.completed === 441 &&
        sample.stage.remainingMs === 0
    )
  ).toBe(true);
  const last = samples.at(-1);
  expect(last.network.supported).toBe(true);
  expect(last.network.transferBytes).toBeGreaterThan(0);
  expect(last.network.requests).toBeGreaterThan(5);
  expect(last.pythonMemoryBytes).toBeGreaterThan(1024 ** 2);
  expect(last.peakPythonMemoryBytes).toBeGreaterThanOrEqual(
    last.pythonMemoryBytes
  );
  expect(last.stage.remainingMs).toBe(0);
  expect(last.stage.failed).toBe(0);
  await expect(diagnostics).toContainText('Last measurements from this run.');
  await expect(
    diagnostics
      .locator('dt')
      .filter({ hasText: /^Interface Delay$/ })
      .locator('..')
  ).toContainText('Stopped');
  const frozen = await diagnostics.textContent();
  await page.waitForTimeout(1200);
  expect(await diagnostics.textContent()).toBe(frozen);
  await page
    .getByRole('button', { name: 'Clear Local Results', exact: true })
    .click();
  await expect(diagnostics).toHaveCount(0);
});

test('browser MM-align, HDBSCAN, and ranking complete a synthetic six-structure pool locally', async ({
  page,
}, testInfo) => {
  test.setTimeout(450000);
  const reference = JSON.parse(
    await readFile('tests/fixtures/amyloid-synthetic-pool.json', 'utf8')
  );
  const original = await readFile('public/tools/amyloid-example/2beg.pdb');
  expect(createHash('sha256').update(original).digest('hex')).toBe(
    reference.source_sha256
  );
  const shifted = Buffer.from(
    original
      .toString()
      .trimEnd()
      .split(/\r?\n/)
      .map((line) => {
        if (!/^(ATOM  |HETATM)/.test(line)) return line;
        const shift =
          reference.chain_translation_x_angstrom *
          (line.charCodeAt(21) - 'A'.charCodeAt(0));
        return (
          line.slice(0, 30) +
          (Number(line.slice(30, 38)) + shift).toFixed(3).padStart(8) +
          line.slice(38)
        );
      })
      .join('\n') + '\n'
  );
  const inputs = Array.from({ length: 6 }, (_, index) => ({
    name: `synthetic-${index + 1}.pdb`,
    mimeType: 'text/plain',
    buffer: index < 3 ? original : shifted,
  }));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8 })
  );
  let baseline: unknown;
  for (const workerCount of [1, 2, 4]) {
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') writes.push(request.url());
    });
    await page.goto('/tools/amyloid-inspector');
    const input = page.getByLabel('Choose Structures', { exact: true });
    await expect(input).toBeEnabled();
    await input.setInputFiles(inputs);
    await page
      .getByRole('combobox', { name: 'Parallel Workers', exact: true })
      .selectOption(String(workerCount));
    await page
      .getByRole('combobox', { name: 'Descriptor Workers', exact: true })
      .selectOption(String(workerCount));
    await page.getByLabel('Minimum Cluster Size', { exact: true }).fill('2');
    await page.getByLabel('Minimum Samples', { exact: true }).fill('1');
    await page
      .getByLabel('Optional Confidence CSV', { exact: true })
      .setInputFiles({
        name: 'confidence.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
          'filename,method,iptm,mean_plddt\n' +
            inputs
              .map((item) => `${item.name},synthetic-test,0.8,80`)
              .join('\n') +
            '\n'
        ),
      });
    await page
      .getByRole('button', { name: 'Analyze On My Device', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Download Local Reports', exact: true })
    ).toBeVisible({ timeout: 150000 });
    await expect(
      page
        .getByRole('region', { name: 'On-Device Analysis', exact: true })
        .getByRole('status')
    ).toHaveText('Analysis Completed');
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100'
    );
    await expect(page.getByText(/group-001: 2 clusters;/)).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download Local Reports', exact: true })
      .click();
    const destination = testInfo.outputPath('batch-device.zip');
    await (await downloaded).saveAs(destination);
    const output = JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          `
import json,zipfile,sys,hashlib
with zipfile.ZipFile(sys.argv[1]) as z:
    checks=json.loads(z.read('SHA256.json'))
    assert set(checks)==set(z.namelist())-{'SHA256.json'}
    for name,digest in checks.items(): assert hashlib.sha256(z.read(name)).hexdigest()==digest,name
    print(json.dumps({'result':json.loads(z.read('results.json')),'matrix':json.loads(z.read('group-001/distance_matrix.json'))}))
`,
          destination,
        ],
        { encoding: 'utf8' }
      )
    );
    expect(
      output.result.structures.every((model) => model.state === 'complete')
    ).toBe(true);
    expect(output.result.descriptor_execution.workers).toBe(workerCount);
    expect(output.result.descriptor_execution.fallback).toBeNull();
    expect(output.result.alignment_execution.workers).toBe(workerCount);
    expect(output.result.alignment_execution.fallback).toBeNull();
    const scientific = { matrix: output.matrix, groups: output.result.groups };
    if (baseline) expect(scientific).toEqual(baseline);
    else baseline = scientific;
    const benchmarkPath = testInfo.outputPath(
      `alignment-benchmark-${workerCount}.json`
    );
    await writeFile(
      benchmarkPath,
      JSON.stringify(output.result.alignment_execution, null, 2)
    );
    await testInfo.attach(`alignment-benchmark-${workerCount}`, {
      path: benchmarkPath,
      contentType: 'application/json',
    });
    const group = output.result.groups[0];
    expect(group.clustering_backend.implementation).toBe(
      'sklearn.cluster.HDBSCAN'
    );
    expect(group.clustering_backend.min_samples_neighbors).toBe(1);
    expect(group.clustering_backend.min_samples_including_self).toBe(2);
    expect(group.representatives.map((item) => item.size).sort()).toEqual([
      3, 3,
    ]);
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++)
        expect(output.matrix.distances[i][j]).toBeCloseTo(
          reference.distances[i][j],
          5
        );
    expect(group.shortlist.length).toBeGreaterThan(0);
    // Browse actual computed clusters without changing the underlying result.
    if (workerCount === 2) {
      const filters = page.getByRole('group', {
        name: 'Filter Results By Cluster',
      });
      const table = page.getByRole('table', {
        name: 'On-Device Structure Results',
        exact: true,
      });
      for (const representative of group.representatives) {
        const option = filters.getByRole('button', {
          name: `Group 1 / Cluster ${representative.cluster} ${representative.size}`,
          exact: true,
        });
        await option.click();
        await expect(option).toHaveAttribute('aria-pressed', 'true');
        await expect(table.locator('tbody tr')).toHaveCount(
          representative.size
        );
        const members = group.members.filter(
          (item) => item.cluster === representative.cluster
        );
        for (const member of members) {
          const model = output.result.structures.find(
            (item) => item.id === member.id
          );
          await expect(table).toContainText(model.filename);
        }
        await page
          .getByRole('button', { name: 'Inspect Representative', exact: true })
          .click();
        const model = output.result.structures.find(
          (item) => item.id === representative.id
        );
        await expect(
          page.getByRole('region', { name: 'Structure Inspection' })
        ).toBeVisible();
        await expect(
          page.getByText('SHA-256 Matched', { exact: true })
        ).toBeVisible();
        await expect(
          page.getByText(representative.id, { exact: true })
        ).toBeVisible();
        await expect(
          page.getByRole('region', { name: 'Browse Clusters' })
        ).toContainText(model.filename);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      await page.getByRole('region', { name: 'Browse Clusters' }).screenshot({
        path: testInfo.outputPath('cluster-browser-mobile.png'),
      });
      const nextDownload = page.waitForEvent('download');
      await page
        .getByRole('button', { name: 'Download Local Reports', exact: true })
        .click();
      const filteredPath = testInfo.outputPath('filtered-view-download.zip');
      await (await nextDownload).saveAs(filteredPath);
      expect(await readFile(filteredPath)).toEqual(await readFile(destination));
      await filters
        .getByRole('button', { name: 'All Structures 6', exact: true })
        .click();
      await expect(table.locator('tbody tr')).toHaveCount(6);
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    for (const member of group.members)
      expect(member.eligibility_reasons).not.toContain(
        'confidence_not_provided'
      );
    expect(writes).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('batch-desktop.png'),
      fullPage: true,
    });
  }
});
