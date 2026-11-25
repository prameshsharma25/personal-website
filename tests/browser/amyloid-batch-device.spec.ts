import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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
  expect(output.matrix.distances).toHaveLength(21);
  expect(output.pairs).toBe(441);
  for (const row of output.matrix.distances) {
    expect(row).toHaveLength(21);
    for (const distance of row) expect(distance).toBeCloseTo(0, 5);
  }
});

test('browser MM-align, HDBSCAN, and ranking complete a synthetic six-structure pool locally', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
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
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
  });
  await page.goto('/tools/amyloid-inspector');
  const input = page.getByLabel('Choose Structures', { exact: true });
  await expect(input).toBeEnabled();
  await input.setInputFiles(inputs);
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
    page.getByText('Analysis Complete', { exact: true })
  ).toBeVisible();
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
  const group = output.result.groups[0];
  expect(group.clustering_backend.implementation).toBe(
    'sklearn.cluster.HDBSCAN'
  );
  expect(group.clustering_backend.min_samples_neighbors).toBe(1);
  expect(group.clustering_backend.min_samples_including_self).toBe(2);
  expect(group.representatives.map((item) => item.size).sort()).toEqual([3, 3]);
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++)
      expect(output.matrix.distances[i][j]).toBeCloseTo(
        reference.distances[i][j],
        5
      );
  expect(group.shortlist.length).toBeGreaterThan(0);
  for (const member of group.members)
    expect(member.eligibility_reasons).not.toContain('confidence_not_provided');
  expect(writes).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('batch-desktop.png'),
    fullPage: true,
  });
});
