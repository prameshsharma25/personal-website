import { test, expect } from '@playwright/test';

const url = '/tools/amyloid-device/v1/checkpoints.mjs';

test('completed analysis without a saved ZIP stays completed after reload and can rebuild', async ({
  page,
}) => {
  await page.goto('/tools/amyloid-inspector');
  const first = await page.evaluate(async (url) => {
    const store = await import(url);
    const input = { files: [] };
    const run = await store.openCheckpoint(
      input,
      {},
      undefined,
      'completed-no-copy'
    );
    await run.put('descriptors', 'a', {
      model: { id: 'a', state: 'complete' },
    });
    await store.markCheckpointFinished(
      run.meta.id,
      run.meta.attempt,
      { hasErrors: false, saveError: 'QuotaExceededError' },
      123456
    );
    return {
      meta: await store.readCheckpointSummary(run.meta.id),
      runs: await store.listCheckpoints(),
      result: await store.readCheckpointCompletion(run.meta.id),
    };
  }, url);
  expect(first.meta).toMatchObject({
    status: 'incomplete',
    analysisStatus: 'completed',
    resultStorage: 'not_saved',
    elapsedMs: 123456,
    error: '',
    saveError: 'QuotaExceededError',
  });
  expect(first.runs[0].displayStatus).toBe('completed');
  expect(first.result).toBeNull();
  await page.reload();
  const history = page.getByRole('region', {
    name: 'Run History',
    exact: true,
  });
  await expect(
    history.getByRole('button', { name: 'Completed 1', exact: true })
  ).toBeVisible();
  await expect(history).toContainText('Results Not Saved In Browser');
  await expect(
    page.getByRole('button', { name: 'Open Saved Results', exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Rebuild Download From Checkpoints',
      exact: true,
    })
  ).toBeVisible();
  const resumed = await page.evaluate(async (url) => {
    const store = await import(url);
    const old = await store.readCheckpointSummary('completed-no-copy');
    const resumed = await store.openCheckpoint({ files: [] }, {}, old.id);
    let refused = false;
    try {
      await store.markCheckpointFinished(
        old.id,
        old.attempt,
        { hasErrors: false, saveError: '' },
        999999
      );
    } catch {
      refused = true;
    }
    return {
      refused,
      meta: await store.readCheckpointSummary(old.id),
      assessment: await resumed.get('descriptors', 'a'),
    };
  }, url);
  expect(resumed.refused).toBe(true);
  expect(resumed.meta.analysisStatus).toBeUndefined();
  expect(resumed.meta.elapsedMs).toBe(123456);
  expect(resumed.assessment.model.id).toBe('a');
});

test('retry saves finished output while preserving checkpoints, elapsed time, and other runs', async ({
  page,
}) => {
  await page.goto('/tools/amyloid-inspector');
  const result = await page.evaluate(async (url) => {
    const store = await import(url);
    const input = {
      files: [{ name: 'example.pdb', bytes: new Uint8Array([1, 2]).buffer }],
    };
    const session = await store.openCheckpoint(
      input,
      {},
      undefined,
      'retry-finished'
    );
    const other = await store.openCheckpoint(input, {}, undefined, 'other-run');
    await session.put('descriptors', 'a', {
      model: { id: 'a', state: 'complete' },
    });
    await session.put('alignments', 'a:a', { distance: 0 });
    await other.put('descriptors', 'b', {
      model: { id: 'b', state: 'complete' },
    });
    const payload = {
      type: 'complete',
      result: { structures: [], groups: [] },
      archive: new Uint8Array([5, 7, 9]).buffer,
      artifacts: {
        a: [{ name: 'a.pdb', bytes: new Uint8Array([2, 4, 6]).buffer }],
      },
      checkpointSaved: true,
    };
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: any, key: any) {
      if (this.name === 'completion' && key?.[1] === 'current')
        throw new DOMException('', 'QuotaExceededError');
      return original.call(this, value, key);
    };
    let failure;
    try {
      await session.put('completion', 'current', payload);
    } catch (e) {
      failure = store.checkpointFailure(e);
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    await store.setCheckpointActivity(
      session.meta.id,
      'failed',
      failure.name,
      3104000
    );
    const orphaned = (await session.keys('completion')).length;
    const progress: number[] = [];
    const final = await store.retryCheckpointCompletion(
      session.meta.id,
      session.meta.attempt,
      payload,
      3104000,
      (done: number, total: number) => progress.push(done / total)
    );
    // A second click cannot rewrite completed output, even with different bytes.
    await store.retryCheckpointCompletion(
      session.meta.id,
      session.meta.attempt,
      { ...payload, archive: new Uint8Array([0]).buffer },
      9999999
    );
    const restored = await store.readCheckpointCompletion(session.meta.id);
    return {
      failure,
      orphaned,
      progress,
      final,
      archive: Array.from(new Uint8Array(restored.archive)),
      file: Array.from(new Uint8Array(restored.artifacts.a[0].bytes)),
      input: await store.readCheckpointInputs(session.meta.id),
      assessment: await session.get('descriptors', 'a'),
      comparison: await session.get('alignments', 'a:a'),
      other: await other.get('descriptors', 'b'),
      keys: await session.keys('completion'),
    };
  }, url);
  expect(result.failure.name).toBe('QuotaExceededError');
  expect(result.failure.message).toContain('storage');
  expect(result.orphaned).toBe(2);
  expect(result.progress[0]).toBe(0);
  expect(result.progress.at(-1)).toBe(1);
  expect(result.final).toMatchObject({
    status: 'complete',
    descriptors: 1,
    alignments: 1,
    elapsedMs: 3104000,
    error: '',
  });
  expect(result.archive).toEqual([5, 7, 9]);
  expect(result.file).toEqual([2, 4, 6]);
  expect(result.input.files[0].name).toBe('example.pdb');
  expect(result.assessment.model.id).toBe('a');
  expect(result.comparison).toEqual({ distance: 0 });
  expect(result.other.model.id).toBe('b');
  expect(result.keys).toHaveLength(3);
});

test('retry refuses concurrent and stale attempts before removing any saved output', async ({
  page,
}) => {
  await page.goto('/tools/amyloid-inspector');
  const result = await page.evaluate(async (url) => {
    const store = await import(url);
    const input = { files: [] };
    const old = await store.openCheckpoint(
      input,
      {},
      undefined,
      'fenced-retry'
    );
    await old.put('descriptors', 'a', {
      model: { id: 'a', state: 'complete' },
    });
    const payload = {
      archive: new Uint8Array([1]).buffer,
      artifacts: {},
      result: { structures: [], groups: [] },
    };
    const release = await store.acquireCheckpointLock(old.meta.id);
    let concurrent = '';
    try {
      await store.retryCheckpointCompletion(
        old.meta.id,
        old.meta.attempt,
        payload,
        0
      );
    } catch (e) {
      concurrent = (e as Error).message;
    }
    await release();
    const latest = await store.openCheckpoint(input, {}, old.meta.id);
    await latest.put(
      'completion',
      'part:in-progress',
      new Uint8Array([2]).buffer
    );
    let stale = '';
    try {
      await store.retryCheckpointCompletion(
        old.meta.id,
        old.meta.attempt,
        payload,
        0
      );
    } catch (e) {
      stale = (e as Error).message;
    }
    const reacquire = await store.acquireCheckpointLock(old.meta.id);
    await reacquire();
    return {
      concurrent,
      stale,
      keys: await latest.keys('completion'),
      assessment: await latest.get('descriptors', 'a'),
      meta: await store.readCheckpointSummary(old.meta.id),
    };
  }, url);
  expect(result.concurrent).toContain('Another tab');
  expect(result.stale).toContain('resumed in another tab');
  expect(result.keys).toEqual(['part:in-progress']);
  expect(result.assessment.model.id).toBe('a');
  expect(result.meta.status).toBe('incomplete');
});
