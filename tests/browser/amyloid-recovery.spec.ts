import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

test.use({ actionTimeout: 15000 });

const moduleURL = '/tools/amyloid-device/v1/checkpoints.mjs';
async function saved(page: Page) {
  return page.evaluate(async (url) => {
    const store = await import(url);
    const meta = await store.readCheckpointSummary();
    return meta;
  }, moduleURL);
}
async function instrument(page: Page) {
  page.on('dialog', (dialog) => dialog.accept());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8 });
    const Original = window.Worker;
    (window as any).__recovery = {
      halted: false,
      descriptors: [],
      comparisons: 0,
      reads: [],
      result: null,
    };
    window.Worker = class extends Original {
      workerName: string;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.workerName = options?.name || '';
        if (this.workerName === 'amyloid-on-device')
          this.addEventListener('message', ({ data }) => {
            const state = (window as any).__recovery;
            if (data.type === 'complete') state.result = data.result;
            if (
              data.type === 'progress' &&
              data.stage === 'Calculating Descriptors: Reading Coordinates'
            )
              state.reads.push(data.filename);
            const stop = sessionStorage.getItem('recovery-test-stop');
            if (
              !state.halted &&
              ((stop === 'descriptors' && data.type === 'model') ||
                (stop === 'alignment' &&
                  data.type === 'progress' &&
                  data.phase === 'alignment' &&
                  data.completed >= 4))
            ) {
              state.halted = true;
              this.terminate(); // Simulate a lost coordinator, not a graceful app cancellation.
            }
          });
      }
      postMessage(message: any, options?: any) {
        if (
          this.workerName === 'amyloid-descriptors' &&
          message.type === 'analyze'
        )
          (window as any).__recovery.descriptors.push(message.entry.id);
        if (message.type === 'align') (window as any).__recovery.comparisons++;
        return super.postMessage(message, options ?? []);
      }
    };
  });
}
async function download(page: Page, path: string) {
  const next = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download Local Reports', exact: true })
    .click();
  await (await next).saveAs(path);
}
async function waitComplete(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Download Local Reports', exact: true })
  ).toBeVisible({ timeout: 150000 });
}

test('real parallel descriptors and comparisons resume after two crashes with identical science', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(240000);
  await instrument(page);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
  });
  const original = await readFile('public/tools/amyloid-example/2beg.pdb');
  const shifted = Buffer.from(
    original
      .toString()
      .trimEnd()
      .split(/\r?\n/)
      .map((line) => {
        if (!/^(ATOM  |HETATM)/.test(line)) return line;
        return (
          line.slice(0, 30) +
          (Number(line.slice(30, 38)) + 20 * (line.charCodeAt(21) - 65))
            .toFixed(3)
            .padStart(8) +
          line.slice(38)
        );
      })
      .join('\n') + '\n'
  );
  const inputs = Array.from({ length: 6 }, (_, i) => ({
    name: `recovery-${i + 1}.pdb`,
    mimeType: 'text/plain',
    buffer: i < 3 ? original : shifted,
  }));
  const confidence = {
    name: 'confidence.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'filename,method,iptm,mean_plddt\n' +
        inputs.map((f) => `${f.name},recovery-test,0.8,80`).join('\n') +
        '\n'
    ),
  };
  await page.goto('/tools/amyloid-inspector');
  await page.evaluate(() =>
    sessionStorage.setItem('recovery-test-stop', 'descriptors')
  );
  await page
    .getByLabel('Choose Structures', { exact: true })
    .setInputFiles(inputs);
  await page
    .getByRole('combobox', { name: 'Descriptor Workers', exact: true })
    .selectOption('2');
  await page
    .getByRole('combobox', { name: 'Parallel Workers', exact: true })
    .selectOption('2');
  await page.getByLabel('Minimum Cluster Size', { exact: true }).fill('2');
  await page.getByLabel('Minimum Samples', { exact: true }).fill('1');
  await page
    .getByLabel('Optional Confidence CSV', { exact: true })
    .setInputFiles(confidence);
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      (window as any).__recovery.halted ||
      document.querySelector('main [role=alert]'),
    undefined,
    {
      timeout: 90000,
    }
  );
  expect(await page.locator('main [role=alert]').allTextContents()).toEqual([]);
  const first = await saved(page);
  expect(first.descriptors).toBeGreaterThan(0);
  expect(first.descriptors).toBeLessThan(6);
  const cachedIds = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('amyloid-analysis-checkpoints-v1', 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('descriptors');
          const keys = tx.objectStore('descriptors').getAllKeys();
          keys.onsuccess = () =>
            resolve(keys.result.map((key) => (key as string[])[1]));
          tx.oncomplete = () => db.close();
        };
      })
  );
  // The originating page still owns the lock even though its worker was lost.
  const other = await context.newPage();
  await other.goto('/tools/amyloid-inspector');
  await expect(
    other.getByRole('button', { name: 'Resume Saved Run', exact: true })
  ).toBeDisabled();
  await expect(
    other.getByRole('button', { name: 'Delete Saved Run', exact: true })
  ).toBeDisabled();
  await expect(
    other.getByRole('region', { name: 'Saved Analysis', exact: true })
  ).toContainText('another tab');
  expect((await saved(other)).id).toBe(first.id);
  await other.close();
  await page.evaluate(() =>
    sessionStorage.setItem('recovery-test-stop', 'alignment')
  );
  await page.reload();
  await page
    .getByRole('button', { name: 'Resume Saved Run', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      (window as any).__recovery.halted ||
      document.querySelector('main [role=alert]'),
    undefined,
    {
      timeout: 90000,
    }
  );
  expect(await page.locator('main [role=alert]').allTextContents()).toEqual([]);
  const second = await saved(page);
  expect(second.id).toBe(first.id);
  expect(second.descriptors).toBe(6);
  expect(second.alignments).toBeGreaterThanOrEqual(4);
  expect(second.alignments).toBeLessThan(36);
  const calculated = await page.evaluate(
    () => (window as any).__recovery.descriptors
  );
  expect(calculated).toHaveLength(6 - cachedIds.length);
  for (const id of cachedIds) expect(calculated).not.toContain(id);
  await page.evaluate(() => sessionStorage.removeItem('recovery-test-stop'));
  await page.reload();
  await page
    .getByRole('region', { name: 'Saved Analysis' })
    .screenshot({ path: testInfo.outputPath('resume-checkpoint.png') });
  await page
    .getByRole('button', { name: 'Resume Saved Run', exact: true })
    .click();
  await waitComplete(page);
  const state = await page.evaluate(() => (window as any).__recovery);
  expect(state.descriptors).toEqual([]);
  expect(state.comparisons).toBe(36 - second.alignments);
  expect(state.result.recovery).toEqual({
    resumed: true,
    reused_descriptors: 6,
    reused_alignments: second.alignments,
  });
  expect(state.result.groups[0].representatives.map((r) => r.size)).toEqual([
    3, 3,
  ]);
  const recovered = testInfo.outputPath('recovered.zip');
  await download(page, recovered);
  expect((await saved(page)).status).toBe('complete');
  // Completed output reopens without loading the Python engine again.
  await page.reload();
  await page.route('**/engine.json', (route) => route.abort());
  await page
    .getByRole('button', { name: 'Open Saved Results', exact: true })
    .click();
  await waitComplete(page);
  const reopened = testInfo.outputPath('reopened.zip');
  await download(page, reopened);
  expect(await readFile(reopened)).toEqual(await readFile(recovered));
  expect(
    await page.evaluate(() => (window as any).__recovery.descriptors)
  ).toEqual([]);
  await page.unroute('**/engine.json');
  await page
    .getByRole('button', { name: 'Delete Saved Run', exact: true })
    .click();
  expect(await saved(page)).toBeNull();
  // Deleting the selected run also clears its workspace. Re-select inputs for the fresh comparison.
  await page
    .getByLabel('Choose Structures', { exact: true })
    .setInputFiles(inputs);
  await page
    .getByLabel('Optional Confidence CSV', { exact: true })
    .setInputFiles(confidence);
  // Fresh calculation of the same inputs verifies restoration did not alter science.
  await page
    .getByLabel('Save Progress On This Device', { exact: true })
    .uncheck();
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await waitComplete(page);
  const baseline = testInfo.outputPath('uninterrupted.zip');
  await download(page, baseline);
  const verification = execFileSync(
    'python3',
    [
      '-c',
      `
import sys,json,zipfile,hashlib,re

def clean(v):
    if isinstance(v,dict): return {k:clean(x) for k,x in v.items() if k!='created_utc'}
    if isinstance(v,list): return [clean(x) for x in v]
    if isinstance(v,str) and re.fullmatch('[0-9a-f]{64}',v): return '<checksum>'
    return v
with zipfile.ZipFile(sys.argv[1]) as a, zipfile.ZipFile(sys.argv[2]) as b:
    for z in [a,b]:
        for name,digest in json.loads(z.read('SHA256.json')).items(): assert hashlib.sha256(z.read(name)).hexdigest()==digest,name
    ar,br=[json.loads(z.read('results.json')) for z in [a,b]]
    assert ar['groups']==br['groups']
    assert ar['structures']==br['structures']
    for name in a.namelist():
        if name.startswith('model-') and name.endswith('.json'): assert clean(json.loads(a.read(name)))==clean(json.loads(b.read(name))),name
        if name.endswith(('.pdb','.csv')): assert a.read(name)==b.read(name),name
    print('Scientific values, coordinates, clustering, selection, and archive checksums match.')
`,
      recovered,
      baseline,
    ],
    { encoding: 'utf8' }
  );
  expect(verification).toContain('Scientific values');
  expect(writes).toEqual([]);
});

test('serial recovery reuses a saved failed input and cancellation keeps a recoverable run', async ({
  page,
}) => {
  test.setTimeout(120000);
  await instrument(page);
  await page.goto('/tools/amyloid-inspector');
  await page.evaluate(() =>
    sessionStorage.setItem('recovery-test-stop', 'descriptors')
  );
  await page.getByLabel('Choose Structures', { exact: true }).setInputFiles([
    { name: 'bad.pdb', mimeType: 'text/plain', buffer: Buffer.from('invalid') },
    {
      name: 'valid.pdb',
      mimeType: 'text/plain',
      buffer: await readFile('public/tools/amyloid-example/2beg.pdb'),
    },
  ]);
  await page
    .getByRole('combobox', { name: 'Descriptor Workers', exact: true })
    .selectOption('1');
  await page
    .getByLabel('Compare And Cluster Structures', { exact: true })
    .uncheck();
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      (window as any).__recovery.halted ||
      document.querySelector('main [role=alert]'),
    undefined,
    {
      timeout: 60000,
    }
  );
  await page
    .getByRole('button', { name: 'Pause Analysis', exact: true })
    .click();
  const before = await saved(page);
  expect(before.descriptors).toBe(1);
  await page.evaluate(() => sessionStorage.removeItem('recovery-test-stop'));
  await page.reload();
  await page
    .getByRole('button', { name: 'Resume Saved Run', exact: true })
    .click();
  await waitComplete(page);
  const state = await page.evaluate(() => (window as any).__recovery);
  expect(state.reads).not.toContain('bad.pdb');
  expect(state.reads).toContain('valid.pdb');
  expect(state.result.recovery.reused_descriptors).toBe(1);
  expect(state.result.structures.map((m) => m.state)).toEqual([
    'failed',
    'complete',
  ]);
  await page
    .getByRole('button', { name: 'Clear Local Results', exact: true })
    .click();
  expect(await saved(page)).toBeNull();
});

test('storage transactions are atomic, fenced, and reject changed inputs or engines', async ({
  page,
}) => {
  await page.goto('/tools/amyloid-inspector');
  const outcome = await page.evaluate(async (url) => {
    const store = await import(url);
    const input = {
      files: [{ name: 'test.pdb', bytes: new Uint8Array([1, 2, 3]).buffer }],
      confidence: null,
      compare: false,
      settings: { min_cluster_size: 2, min_samples: 1, max_candidates: 10 },
      descriptorWorkers: 1,
      alignmentWorkers: 1,
    };
    const id = crypto.randomUUID();
    const release = await store.acquireCheckpointLock(id);
    const session = await store.openCheckpoint(
      input,
      { engine: 1 },
      undefined,
      id
    );
    await session.put('descriptors', 'model-001', {
      model: { id: 'model-001' },
      artifacts: [
        { path: 'model-001/test.pdb', bytes: new Uint8Array([4, 5]).buffer },
      ],
    });
    await session.put('descriptors', 'model-001', {
      model: { id: 'model-001' },
      artifacts: [],
    });
    let lockError = '',
      versionError = '',
      quotaError = '';
    try {
      await store.deleteCheckpoint(session.meta.id);
    } catch (e) {
      lockError = e.message;
    }
    try {
      await store.openCheckpoint(input, { engine: 2 }, session.meta.id);
    } catch (e) {
      versionError = e.message;
    }
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'descriptors')
        throw new DOMException('Test quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try {
      await session.put('descriptors', 'model-002', { model: {} });
    } catch (e) {
      quotaError = e.message;
    } finally {
      IDBObjectStore.prototype.put = put;
    }
    const count = (await store.readCheckpointSummary()).descriptors;
    const missing = await session.get('descriptors', 'model-002');
    const changed = { ...input, compare: true };
    let inputError = '';
    try {
      await store.openCheckpoint(changed, { engine: 1 }, session.meta.id);
    } catch (e) {
      inputError = e.message;
    }
    await session.put('completion', 'current', {
      archive: new Uint8Array([8]).buffer,
    });
    const replacement = await store.openCheckpoint(input, { engine: 1 });
    const retained = await store.readCheckpointCompletion(session.meta.id);
    let staleError = '';
    try {
      await session.put('descriptors', 'stale', {});
    } catch (e) {
      staleError = e.message;
    }
    const empty = await replacement.keys('descriptors');
    await release();
    await store.deleteCheckpoint(replacement.meta.id);
    await store.deleteCheckpoint(session.meta.id);
    return {
      retained: retained.archive.byteLength,
      lockError,
      versionError,
      inputError,
      quotaError,
      staleError,
      count,
      missing,
      empty,
      deleted: await store.readCheckpointSummary(),
    };
  }, moduleURL);
  expect(outcome.retained).toBe(1);
  expect(outcome.lockError).toContain('Another tab');
  expect(outcome.versionError).toContain('different analysis engine');
  expect(outcome.inputError).toContain('settings do not match');
  expect(outcome.quotaError).toContain('Test quota');
  expect(outcome.count).toBe(1);
  expect(outcome.missing).toBeNull();
  expect(outcome.staleError).toContain('saved run changed');
  expect(outcome.empty).toEqual([]);
  expect(outcome.deleted).toBeNull();
});

for (const problem of ['engine', 'corrupt input']) {
  test(`recovery refuses ${problem} mismatches without deleting the checkpoint`, async ({
    page,
  }) => {
    await page.goto('/tools/amyloid-inspector');
    const id = await page.evaluate(
      async ({ url, problem }) => {
        const store = await import(url);
        const engine = await (
          await fetch('/tools/amyloid-device/v1/engine.json')
        ).json();
        if (problem === 'engine') engine.package_commit = 'different-version';
        const input = {
          files: [
            { name: 'test.pdb', bytes: new Uint8Array([1, 2, 3]).buffer },
          ],
          confidence: null,
          compare: false,
          settings: { min_cluster_size: 2, min_samples: 1, max_candidates: 10 },
          descriptorWorkers: 1,
          alignmentWorkers: 1,
        };
        const id = crypto.randomUUID();
        const release = await store.acquireCheckpointLock(id);
        const run = await store.openCheckpoint(input, engine, undefined, id);
        if (problem === 'corrupt input')
          await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(
              'amyloid-analysis-checkpoints-v1',
              2
            );
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction('inputs', 'readwrite');
              const inputStore = tx.objectStore('inputs');
              const saved = inputStore.get([run.meta.id, 'current']);
              saved.onsuccess = () => {
                new Uint8Array(saved.result.payload.files[0].bytes)[0] = 99;
                inputStore.put(saved.result, [run.meta.id, 'current']);
              };
              tx.oncomplete = () => {
                db.close();
                resolve();
              };
              tx.onabort = () => reject(tx.error);
            };
          });
        await release();
        return run.meta.id;
      },
      { url: moduleURL, problem }
    );
    await page.reload();
    await page
      .getByRole('button', { name: 'Resume Saved Run', exact: true })
      .click();
    await expect(page.locator('main [role=alert]')).toContainText(
      problem === 'engine' ? 'different analysis engine' : 'integrity check'
    );
    expect((await saved(page)).id).toBe(id);
    await page
      .getByRole('button', { name: 'Delete Saved Run', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'Saved Analysis' })
    ).toHaveCount(0);
    expect(await saved(page)).toBeNull();
  });
}

test('a checkpoint quota failure is visible and analysis still finishes', async ({
  page,
}) => {
  test.setTimeout(90000);
  const module = await readFile(
    'public/tools/amyloid-device/v1/checkpoints.mjs',
    'utf8'
  );
  await page.route('**/checkpoints.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: module.replace(
        'async put(store, key, payload) {',
        "async put(store, key, payload) { if (store === 'descriptors') throw new DOMException('Test checkpoint quota', 'QuotaExceededError');"
      ),
    })
  );
  await page.goto('/tools/amyloid-inspector');
  await page
    .getByLabel('Choose Structures', { exact: true })
    .setInputFiles('public/tools/amyloid-example/2beg.pdb');
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await waitComplete(page);
  await expect(
    page.getByRole('region', { name: 'On-Device Analysis', exact: true })
  ).toContainText('Saving progress stopped: Test checkpoint quota');
  const checkpoint = await saved(page);
  expect(checkpoint.status).toBe('incomplete');
  expect(checkpoint.descriptors).toBe(0);
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
});
