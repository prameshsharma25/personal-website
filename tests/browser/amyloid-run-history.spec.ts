import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ actionTimeout: 15000 });
const moduleURL = '/tools/amyloid-device/v1/checkpoints.mjs';
async function history(page: Page) {
  return page.evaluate(
    async (url) => (await import(url)).listCheckpoints(),
    moduleURL
  );
}
async function download(page: Page, path: string) {
  const next = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download Local Reports', exact: true })
    .click();
  await (await next).saveAs(path);
  return readFile(path);
}

test('run history preserves multiple real runs and opens their own inputs, results, and downloads', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  page.on('dialog', (d) => d.accept());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const Original = window.Worker;
    (window as any).__historyWorkers = 0;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (options?.name === 'amyloid-on-device') {
          (window as any).__historyWorkers++;
          (window as any).__historyWorker = this;
        }
      }
    };
  });
  await page.goto('/tools/amyloid-inspector');
  const list = page.getByRole('region', { name: 'Run History', exact: true });
  const rows = list.getByRole('list', { name: 'Saved Runs' });
  const analyze = page.getByRole('button', {
    name: 'Analyze On My Device',
    exact: true,
  });
  const done = page.getByRole('button', {
    name: 'Download Local Reports',
    exact: true,
  });
  await expect(list).toContainText('Your saved analyses will appear here');
  await page.getByLabel('Choose Structures', { exact: true }).setInputFiles({
    name: 'first.pdb',
    mimeType: 'text/plain',
    buffer: await readFile('public/tools/amyloid-example/2beg.pdb'),
  });
  await analyze.click();
  await expect(done).toBeVisible({ timeout: 90000 });
  const first = (await history(page))[0];
  expect(first.displayStatus).toBe('completed');
  const bytes = await download(page, info.outputPath('first.zip'));

  await list.getByRole('button', { name: 'New Analysis', exact: true }).click();
  await expect(done).toHaveCount(0);
  await expect(rows.getByRole('button')).toHaveCount(1);
  await page.getByLabel('Choose Structures', { exact: true }).setInputFiles([
    {
      name: 'second.pdb',
      mimeType: 'text/plain',
      buffer: await readFile('public/tools/amyloid-example/6qjh.pdb'),
    },
    {
      name: 'third.pdb',
      mimeType: 'text/plain',
      buffer: await readFile('public/tools/amyloid-example/6qjh.pdb'),
    },
  ]);
  await page.getByLabel('Compare And Cluster Structures').uncheck();
  await page
    .getByRole('combobox', { name: 'Descriptor Workers', exact: true })
    .selectOption('2');
  await analyze.click();
  await expect(
    rows.getByRole('button', {
      name: 'Open second.pdb + 1 More, Running',
      exact: true,
    })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Pause Analysis', exact: true })
    .click();
  await expect(
    rows.getByRole('button', {
      name: 'Open second.pdb + 1 More, Paused',
      exact: true,
    })
  ).toBeEnabled();
  const second = (await history(page))[0];
  expect((await history(page)).map((run) => run.id)).toEqual([
    second.id,
    first.id,
  ]);

  await rows
    .getByRole('button', { name: 'Open first.pdb, Completed', exact: true })
    .click();
  await expect(done).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Scrollable Structure Results' })
  ).toContainText('first.pdb');
  expect(await download(page, info.outputPath('first-reopened.zip'))).toEqual(
    bytes
  );
  const workers = await page.evaluate(() => (window as any).__historyWorkers);
  await rows
    .getByRole('button', {
      name: 'Open second.pdb + 1 More, Paused',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Descriptor Workers', exact: true })
  ).toHaveValue('2');
  await expect(
    page.getByLabel('Compare And Cluster Structures')
  ).not.toBeChecked();
  await expect(done).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__historyWorkers)).toBe(
    workers
  );
  await page
    .getByRole('button', { name: 'Resume Saved Run', exact: true })
    .click();
  await expect(done).toBeVisible({ timeout: 90000 });
  expect(
    (await history(page)).every((run) => run.displayStatus === 'completed')
  ).toBe(true);
  await expect(
    page.getByRole('region', { name: 'Scrollable Structure Results' })
  ).toContainText('second.pdb');

  // A stopped engine is a failed run with recoverable inputs, not a completed one.
  await list.getByRole('button', { name: 'New Analysis', exact: true }).click();
  await page.getByLabel('Choose Structures', { exact: true }).setInputFiles({
    name: 'interrupted.pdb',
    mimeType: 'text/plain',
    buffer: await readFile('public/tools/amyloid-example/2beg.pdb'),
  });
  await analyze.click();
  await expect(
    rows.getByRole('button', {
      name: 'Open interrupted.pdb, Running',
      exact: true,
    })
  ).toBeVisible();
  await page.evaluate(() =>
    (window as any).__historyWorker.dispatchEvent(
      new ErrorEvent('error', { message: 'Simulated crash', cancelable: true })
    )
  );
  await expect(
    rows.getByRole('button', {
      name: 'Open interrupted.pdb, Failed',
      exact: true,
    })
  ).toBeEnabled();
  await page.reload();
  await expect(rows.getByRole('button')).toHaveCount(3);
  await list.getByRole('button', { name: 'Completed 2', exact: true }).click();
  await expect(rows.getByRole('button')).toHaveCount(2);
  await list.getByRole('button', { name: 'Failed 1', exact: true }).click();
  await rows
    .getByRole('button', { name: 'Open interrupted.pdb, Failed', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Saved Analysis' })
  ).toContainText('Last Run Error');
  await page
    .getByRole('button', { name: 'Delete Saved Run', exact: true })
    .click();
  expect((await history(page)).map((run) => run.id)).toEqual([
    second.id,
    first.id,
  ]);
  await list.getByRole('button', { name: 'All Runs 2', exact: true }).click();
  await rows
    .getByRole('button', { name: 'Open first.pdb, Completed', exact: true })
    .click();
  await expect(done).toBeVisible();
  expect(await download(page, info.outputPath('first-retained.zip'))).toEqual(
    bytes
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
  await list.screenshot({ path: info.outputPath('run-history-mobile.png') });
  expect(errors).toEqual([]);
});

test('run namespaces isolate deletion, enforce run locks, and fence superseded attempts', async ({
  page,
}) => {
  await page.goto('/tools/amyloid-inspector');
  const outcome = await page.evaluate(async (url) => {
    const store = await import(url);
    const input = {
      files: [{ name: 'test.pdb', bytes: new Uint8Array([1, 2, 3]).buffer }],
      compare: false,
      confidence: null,
      settings: {},
      descriptorWorkers: 1,
      alignmentWorkers: 1,
    };
    const first = await store.openCheckpoint(input, { engine: 1 });
    const release = await store.acquireCheckpointLock(first.meta.id);
    const second = await store.openCheckpoint(input, { engine: 1 });
    const secondRelease = await store.acquireCheckpointLock(second.meta.id);
    const active = (await store.listCheckpoints()).map(
      (run) => run.displayStatus
    );
    let locked = '';
    try {
      await store.deleteCheckpoint(first.meta.id);
    } catch (error) {
      locked = error.message;
    }
    await secondRelease();
    await store.deleteCheckpoint(second.meta.id);
    await first.put('alignments', 'group:0:0', { score: 1 });
    const resumed = await store.openCheckpoint(
      input,
      { engine: 1 },
      first.meta.id
    );
    let stale = '';
    try {
      await first.put('alignments', 'group:1:1', { score: 2 });
    } catch (error) {
      stale = error.message;
    }
    const keys = await resumed.keys('alignments');
    await release();
    const paused = (await store.listCheckpoints())[0].displayStatus;
    return {
      active,
      locked,
      stale,
      keys,
      paused,
      count: (await store.listCheckpoints()).length,
    };
  }, moduleURL);
  expect(outcome.active).toEqual(['running', 'running']);
  expect(outcome.locked).toContain('Another tab');
  expect(outcome.stale).toContain('saved run changed');
  expect(outcome.keys).toEqual(['group:0:0']);
  expect(outcome.paused).toBe('paused');
  expect(outcome.count).toBe(1);
});

for (const complete of [false, true]) {
  test(`version 1 ${complete ? 'completed' : 'unfinished'} checkpoints migrate without data loss`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const legacy = await readFile(
      'tests/fixtures/amyloid-v1-checkpoints.mjs',
      'utf8'
    );
    const engine = JSON.parse(
      await readFile('tests/fixtures/amyloid-v1-engine.json', 'utf8')
    );
    await page.route('**/legacy-checkpoints.mjs', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: legacy })
    );
    await page.goto('/privacy');
    const id = await page.evaluate(
      async ({ engine, complete }) => {
        const legacyURL = '/legacy-checkpoints.mjs';
        const store = await import(legacyURL);
        const input = {
          files: [
            {
              name: 'legacy.pdb',
              bytes: await (
                await fetch('/tools/amyloid-example/2beg.pdb')
              ).arrayBuffer(),
            },
          ],
          confidence: null,
          compare: false,
          settings: {
            min_cluster_size: 10,
            min_samples: 3,
            max_candidates: 10,
          },
          descriptorWorkers: 'auto',
          alignmentWorkers: 'auto',
        };
        const session = await store.openCheckpoint(input, engine);
        if (complete) {
          await session.put('descriptors', 'model-001', {
            model: { id: 'model-001', filename: 'legacy.pdb' },
          });
          await session.put('alignments', 'group:0:0', { score: 1 });
          await session.put('completion', 'current', {
            result: { structures: [], groups: [] },
            artifacts: {},
            archive: new Uint8Array([1, 2, 3]).buffer,
          });
        }
        return session.meta.id;
      },
      { engine, complete }
    );
    await page.goto('/tools/amyloid-inspector');
    await expect(
      page.getByRole('region', { name: 'Run History' })
    ).toContainText('legacy.pdb');
    const data = await page.evaluate(
      async ({ url, id }) => {
        const store = await import(url);
        const meta = await store.readCheckpointSummary(id);
        const input = await store.readCheckpointInputs(id);
        const result = await store.readCheckpointCompletion(id);
        return {
          meta,
          bytes: input.files[0].bytes.byteLength,
          result: result ? Array.from(new Uint8Array(result.archive)) : null,
        };
      },
      { url: moduleURL, id }
    );
    expect(data.meta.id).toBe(id);
    expect(data.bytes).toBeGreaterThan(1000);
    if (complete) {
      expect(data.meta.descriptors).toBe(1);
      expect(data.meta.alignments).toBe(1);
      expect(data.result).toEqual([1, 2, 3]);
    } else {
      const mismatch = await page.evaluate(
        async ({ url, id }) => {
          const store = await import(url);
          const current = await (
            await fetch('/tools/amyloid-device/v1/engine.json')
          ).json();
          const input = await store.readCheckpointInputs(id);
          try {
            await store.openCheckpoint(
              input,
              { ...current, runtime_url: 'different-runtime' },
              id
            );
          } catch (error) {
            return error.message;
          }
          return '';
        },
        { url: moduleURL, id }
      );
      expect(mismatch).toContain('different analysis engine');
      await page
        .getByRole('button', { name: 'Resume Saved Run', exact: true })
        .click();
      await expect(
        page.getByRole('button', {
          name: 'Download Local Reports',
          exact: true,
        })
      ).toBeVisible({ timeout: 60000 });
      expect((await history(page))[0].status).toBe('complete');
    }
  });
}

test('migration preserves an active older tab until its writer lock is released', async ({
  page,
}) => {
  const legacy = await readFile(
    'tests/fixtures/amyloid-v1-checkpoints.mjs',
    'utf8'
  );
  await page.route('**/legacy-checkpoints.mjs', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: legacy })
  );
  await page.goto('/privacy');
  const id = await page.evaluate(async () => {
    const url = '/legacy-checkpoints.mjs';
    const store = await import(url);
    (window as any).__releaseLegacyRun = await store.acquireCheckpointLock();
    const session = await store.openCheckpoint(
      {
        files: [
          {
            name: 'active-legacy.pdb',
            bytes: new Uint8Array([1, 2, 3]).buffer,
          },
        ],
        confidence: null,
        compare: false,
        settings: {},
        descriptorWorkers: 1,
        alignmentWorkers: 1,
      },
      { engine: 1 }
    );
    return session.meta.id;
  });
  const next = await page.context().newPage();
  await next.goto('/tools/amyloid-inspector');
  await expect(
    next.getByRole('region', { name: 'On-Device Analysis', exact: true })
  ).toContainText('An older analysis tab is still running');
  const version = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('amyloid-analysis-checkpoints-v1', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          resolve(request.result.version);
          request.result.close();
        };
      })
  );
  expect(version).toBe(1);
  await page.evaluate(() => (window as any).__releaseLegacyRun());
  await next.bringToFront();
  await expect(
    next.getByRole('region', { name: 'Run History', exact: true })
  ).toContainText('active-legacy.pdb');
  expect((await history(next))[0].id).toBe(id);
  await expect(
    next.getByRole('region', { name: 'On-Device Analysis', exact: true })
  ).not.toContainText('An older analysis tab is still running');
  await next.close();
});
