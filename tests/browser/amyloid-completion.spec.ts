import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const moduleURL = '/tools/amyloid-device/v1/checkpoints.mjs';

for (const fixture of [
  'amyloid-pre-chunk-engine.json',
  'amyloid-chunked-engine.json',
  'amyloid-save-retry-engine.json',
  'amyloid-run-report-engine.json',
])
  test(`preceding release ${fixture} can resume its saved assessments and comparisons`, async ({
    page,
  }) => {
    const previous = JSON.parse(
      await readFile(`tests/fixtures/${fixture}`, 'utf8')
    );
    await page.goto('/tools/amyloid-inspector');
    const result = await page.evaluate(
      async ({ url, previous }) => {
        const store = await import(url);
        const input = {
          files: [
            {
              name: 'existing-run.pdb',
              bytes: new Uint8Array([1, 2, 3]).buffer,
            },
          ],
        };
        const old = await store.openCheckpoint(
          input,
          previous,
          undefined,
          'previous-release'
        );
        await old.put('descriptors', 'a', {
          model: { id: 'a', state: 'complete' },
        });
        await old.put('alignments', 'a:a', { distance: 0 });
        await store.setCheckpointActivity(old.meta.id, 'paused', '', 3022000);
        const current = await (
          await fetch('/tools/amyloid-device/v1/engine.json')
        ).json();
        const resumed = await store.openCheckpoint(input, current, old.meta.id);
        return {
          sameScience:
            (await store.scienceDigest(previous)) ===
            (await store.scienceDigest(current)),
          count: resumed.meta.descriptors,
          pairs: resumed.meta.alignments,
          elapsed: resumed.meta.elapsedMs,
          model: await resumed.get('descriptors', 'a'),
          alignment: await resumed.get('alignments', 'a:a'),
        };
      },
      { url: moduleURL, previous }
    );
    expect(result).toEqual({
      sameScience: true,
      count: 1,
      pairs: 1,
      elapsed: 3022000,
      model: { model: { id: 'a', state: 'complete' } },
      alignment: { distance: 0 },
    });
  });

test('large completed results survive reload with bounded records and identical bytes', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/tools/amyloid-inspector');
  const expected = await page.evaluate(async (url) => {
    const store = await import(url);
    const id = 'large-completed-run';
    const release = await store.acquireCheckpointLock(id);
    const input = {
      files: [{ name: 'large.pdb', bytes: new Uint8Array([1]).buffer }],
    };
    const engine = await (
      await fetch('/tools/amyloid-device/v1/engine.json')
    ).json();
    const session = await store.openCheckpoint(input, engine, undefined, id);
    const archive = new Uint8Array(140 * 1024 * 1024);
    const file = new Uint8Array(9 * 1024 * 1024 + 3);
    for (let i = 0; i < archive.length; i += 8191) archive[i] = i % 251;
    for (let i = 0; i < file.length; i += 4093) file[i] = i % 253;
    archive[archive.length - 1] = 17;
    file[file.length - 1] = 31;
    const value = {
      type: 'complete',
      result: { structures: [], groups: [] },
      artifacts: { first: [{ name: 'first.pdb', bytes: file.buffer }] },
      archive: archive.buffer,
    };

    const progress: number[] = [];
    await session.put(
      'completion',
      'current',
      value,
      (done: number, total: number) => progress.push(done / total)
    );
    const keys = await session.keys('completion');
    const sizes: number[] = [];
    for (const key of keys)
      if (key !== 'current')
        sizes.push((await session.get('completion', key)).byteLength);
    const summary = await store.readCheckpointSummary(id);

    await release();
    return {
      id,
      archiveHash: await store.digest(archive.buffer),
      fileHash: await store.digest(file.buffer),
      sizes,
      progress,
      status: summary.status,
    };
  }, moduleURL);
  expect(expected.status).toBe('complete');
  expect(Math.max(...expected.sizes)).toBeLessThanOrEqual(8 * 1024 * 1024);
  expect(expected.progress[0]).toBe(0);
  expect(expected.progress.at(-1)).toBe(1);
  await page.reload();
  const restored = await page.evaluate(
    async ({ url, id }) => {
      const store = await import(url);
      const value = await store.readCheckpointCompletion(id);
      return {
        archiveHash: await store.digest(value.archive),
        fileHash: await store.digest(value.artifacts.first[0].bytes),
        status: (await store.listCheckpoints())[0].displayStatus,
      };
    },
    { url: moduleURL, id: expected.id }
  );
  expect(restored).toEqual({
    archiveHash: expected.archiveHash,
    fileHash: expected.fileHash,
    status: 'completed',
  });
});

test('failed final commit preserves checkpoints and resume removes abandoned chunks', async ({
  page,
}) => {
  await page.goto('/tools/amyloid-inspector');
  const result = await page.evaluate(async (url) => {
    const store = await import(url);
    const engine = await (
      await fetch('/tools/amyloid-device/v1/engine.json')
    ).json();
    const input = {
      files: [{ name: 'retry.pdb', bytes: new Uint8Array([1]).buffer }],
    };
    const session = await store.openCheckpoint(
      input,
      engine,
      undefined,
      'retry-save'
    );
    await session.put('descriptors', 'a', {
      model: { id: 'a', state: 'complete' },
    });
    await session.put('alignments', 'a:a', { distance: 0 });
    const value = {
      type: 'complete',
      result: { structures: [], groups: [] },
      artifacts: {},
      archive: new ArrayBuffer(17 * 1024 * 1024),
    };
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (record: any, key: any) {
      if (
        this.name === 'completion' &&
        Array.isArray(key) &&
        key[1] === 'current'
      )
        throw new DOMException(
          'Simulated final save quota',
          'QuotaExceededError'
        );
      return original.call(this, record, key);
    };
    let failure = '';
    try {
      await session.put('completion', 'current', value);
    } catch (e) {
      failure = (e as Error).message;
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    const incomplete = await store.readCheckpointSummary('retry-save');
    const absent = await store.readCheckpointCompletion('retry-save');
    const orphaned = await session.keys('completion');
    const resumed = await store.openCheckpoint(input, engine, 'retry-save');
    const cleaned = await resumed.keys('completion');
    let stale = '';
    try {
      await session.put('completion', 'old', new ArrayBuffer(1));
    } catch (e) {
      stale = (e as Error).message;
    }
    await resumed.put('completion', 'current', value);
    const restored = await store.readCheckpointCompletion('retry-save');
    return {
      failure,
      status: incomplete.status,
      descriptors: incomplete.descriptors,
      alignments: incomplete.alignments,
      absent,
      orphaned: orphaned.length,
      cleaned,
      stale,
      size: restored.archive.byteLength,
      final: (await store.listCheckpoints())[0].displayStatus,
    };
  }, moduleURL);
  expect(result.failure).toContain('Simulated final save quota');
  expect(result.status).toBe('incomplete');
  expect(result.descriptors).toBe(1);
  expect(result.alignments).toBe(1);
  expect(result.absent).toBeNull();
  expect(result.orphaned).toBe(3);
  expect(result.cleaned).toEqual([]);
  expect(result.stale).toContain('writer can no longer');
  expect(result.size).toBe(17 * 1024 * 1024);
  expect(result.final).toBe('completed');
});

test('corrupted completion chunks cannot be reopened as valid results', async ({
  page,
}) => {
  await page.goto('/tools/amyloid-inspector');
  const failure = await page.evaluate(async (url) => {
    const store = await import(url);
    const session = await store.openCheckpoint(
      { files: [] },
      {},
      undefined,
      'corrupt-completion'
    );
    await session.put('completion', 'current', {
      type: 'complete',
      result: { structures: [], groups: [] },
      artifacts: {},
      archive: new Uint8Array([3, 5, 7]).buffer,
    });
    const key = (await session.keys('completion')).find((key: string) =>
      key.startsWith('part:')
    );
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('amyloid-analysis-checkpoints-v1', 2);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction('completion', 'readwrite'),
          target = tx.objectStore('completion');
        const record = target.get(['corrupt-completion', key]);
        record.onsuccess = () => {
          new Uint8Array(record.result.payload)[0] = 99;
          target.put(record.result, ['corrupt-completion', key]);
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
    });
    try {
      await store.readCheckpointCompletion('corrupt-completion');
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  }, moduleURL);
  expect(failure).toContain('integrity check');
});

for (const mode of [
  'shortlisted',
  'no shortlist',
  'save failed',
  'metadata failed',
  'rebuild error',
]) {
  test(`completed UI shows the correct initial structure and persistence status: ${mode}`, async ({
    page,
  }) => {
    page.on('dialog', (dialog) => dialog.accept());
    if (mode === 'metadata failed')
      await page.addInitScript(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value: any, key: any) {
          if (
            this.name === 'run' &&
            value.analysisStatus === 'completed' &&
            value.resultStorage === 'not_saved'
          )
            throw new DOMException('', 'QuotaExceededError');
          return original.call(this, value, key);
        };
      });
    let workers = 0;
    page.on('worker', () => workers++);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/amyloid-device/v1/worker.mjs', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `
      import {openCheckpoint,readCheckpointSummary,readCheckpointCompletion,checkpointFailure} from './checkpoints.mjs';
      onmessage=async({data})=>{
        if(data.type!=='start')return;
        if(data.resumeId && (await readCheckpointSummary(data.resumeId)).status==='complete'){
          postMessage(await readCheckpointCompletion(data.resumeId));return;
        }
        const {files,confidence,compare,settings,descriptorWorkers,alignmentWorkers}=data;
        const engine=await(await fetch('./engine.json')).json();
        const session=await openCheckpoint({files,confidence,compare,settings,descriptorWorkers,alignmentWorkers},engine,data.resumeId,data.checkpointId);
        postMessage({type:'checkpoint',summary:session.meta});
        const artifacts={};
        const models=[];
        for(const [id,demo] of [['first','6qjh'],['chosen','2beg']]){
          artifacts[id]=await Promise.all(['gates.json','manifest.json','pdb'].map(async suffix=>({name:demo+'.'+suffix,bytes:await(await fetch('/tools/amyloid-example/'+demo+'.'+suffix)).arrayBuffer()})));
          models.push({id,filename:demo+'.pdb',state:'complete',files:{report:demo+'.gates.json',manifest:demo+'.manifest.json',structure:demo+'.pdb'}});
          await session.put('descriptors',id,{model:models.at(-1),artifacts:artifacts[id]});
        }
        const selected=${JSON.stringify(mode !== 'no shortlist')};
        const completed={type:'complete',result:{structures:models,groups:[{id:'group-001',ids:['first','chosen'],clustering_status:'complete',shortlist:selected?['chosen']:[],members:models.map(m=>({id:m.id,cluster:0,selected_rank:selected&&m.id==='chosen'?1:null,rank_score:1,eligibility_reasons:[]})),representatives:[{id:'first',cluster:0,size:2}]}],warnings:[],elapsed_seconds:1,clustering_status:'requested'},artifacts,archive:new Uint8Array([1,2,3]).buffer,checkpointSaved:true};
        if(${JSON.stringify(mode.endsWith('failed') || mode === 'rebuild error')}){
          completed.checkpointSaved=false;
          completed.checkpointFailure=checkpointFailure(new DOMException('', 'QuotaExceededError'));
          postMessage({type:'checkpoint-warning',failure:completed.checkpointFailure,message:'Saving progress stopped: QuotaExceededError'});
        }else{
          postMessage({type:'progress',stage:'Saving Your Results',phase:'saving',completed:0,total:1});
          const summary=await session.put('completion','current',completed);
          postMessage({type:'checkpoint',summary});
        }
        postMessage(completed);
      };
    `,
      })
    );
    await page.goto('/tools/amyloid-inspector');
    await page.getByLabel('Choose Structures', { exact: true }).setInputFiles([
      {
        name: 'first.pdb',
        mimeType: 'text/plain',
        buffer: await readFile('public/tools/amyloid-example/6qjh.pdb'),
      },
      {
        name: 'second.pdb',
        mimeType: 'text/plain',
        buffer: await readFile('public/tools/amyloid-example/2beg.pdb'),
      },
    ]);
    await page
      .getByRole('button', { name: 'Analyze On My Device', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Download Local Reports', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Pause Analysis', exact: true })
    ).toHaveCount(0);
    const selection = page.getByRole('region', {
      name: 'Initial Structure Selection',
      exact: true,
    });
    await expect(selection).toContainText(
      mode === 'no shortlist' ? '6qjh.pdb' : '2beg.pdb'
    );
    await expect(selection).toContainText(
      mode === 'no shortlist' ? 'No shortlisted candidate' : 'Shortlist #1'
    );
    // Actual report/coordinate verification still runs for the automatically opened example.
    await expect(
      page.getByText(
        mode === 'no shortlist'
          ? '6qjh-Boltz2-pdb-coord-balanced25-rank-001'
          : '2beg-ESMFold2-pdb-coord-balanced25-rank-000',
        { exact: true }
      )
    ).toBeVisible();
    const history = page.getByRole('region', {
      name: 'Run History',
      exact: true,
    });
    await expect(
      history.getByRole('button', {
        name: 'Completed 1',
        exact: true,
      })
    ).toBeVisible();
    if (mode === 'rebuild error') {
      await page.route('**/amyloid-device/v1/worker.mjs', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `onmessage=()=>postMessage({type:'error',message:'Simulated rebuild failure'});`,
        })
      );
      await page
        .getByRole('button', {
          name: 'Rebuild Download From Checkpoints',
          exact: true,
        })
        .click();
      await expect(page.locator('main [role=alert]')).toContainText(
        'Simulated rebuild failure'
      );
      const download = page.waitForEvent('download');
      await page
        .getByRole('button', { name: 'Download Previous Results', exact: true })
        .click();
      const stream = await (await download).createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(chunk);
      expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3]));
      expect(errors).toEqual([]);
      return;
    }
    if (mode.endsWith('failed')) {
      await expect(
        page.getByRole('region', { name: 'Browser Storage', exact: true })
      ).toContainText('Your results are ready to download');
      await expect(page.getByRole('status')).toContainText(
        'Analysis Completed'
      );
      await expect(
        page.getByRole('region', { name: 'Browser Storage', exact: true })
      ).toContainText('QuotaExceededError');
      await expect(
        page.getByRole('region', { name: 'Browser Storage', exact: true })
      ).toContainText('Estimated Storage For This Site');
      await expect(history).toContainText('Results Not Saved In Browser');
      const initialWorkers = workers;
      await page
        .getByRole('button', { name: 'View Current Results', exact: true })
        .click();
      await expect(
        page.getByRole('button', {
          name: 'Download Local Reports',
          exact: true,
        })
      ).toBeVisible();
      expect(workers).toBe(initialWorkers);
      const time = await page.getByRole('timer').textContent();
      const before = workers;
      // Fail once more in the page, then recover without a new analysis worker.
      await page.evaluate(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value: any, key: any) {
          if (this.name === 'completion') {
            IDBObjectStore.prototype.put = original;
            throw new DOMException('', 'UnknownError');
          }
          return original.call(this, value, key);
        };
      });
      await page
        .getByRole('button', { name: 'Retry Saving Results', exact: true })
        .click();
      await expect(
        page.getByRole('region', { name: 'Browser Storage', exact: true })
      ).toContainText('UnknownError');
      await expect(
        history.getByRole('button', { name: 'Completed 1', exact: true })
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Retry Saving Results', exact: true })
        .click();
      await expect(
        history.getByRole('button', { name: 'Completed 1', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('region', { name: 'Browser Storage', exact: true })
      ).toHaveCount(0);
      await expect(history).toContainText('Results Saved In Browser');
      await expect(page.locator('main [role=alert]')).toHaveCount(0);
      await expect(page.getByRole('status')).toContainText(
        'Analysis Completed'
      );
      await expect(page.getByRole('timer')).toHaveText(time!);
      expect(workers).toBe(before);
      const saved = await page.evaluate(async (url) => {
        const store = await import(url);
        const run = (await store.listCheckpoints())[0];
        const completed = await store.readCheckpointCompletion(run.id);
        return {
          bytes: Array.from(new Uint8Array(completed.archive)),
          descriptors: run.descriptors,
          error: run.error,
        };
      }, moduleURL);
      expect(saved).toEqual({ bytes: [1, 2, 3], descriptors: 2, error: '' });
      await page.reload();
      await page
        .getByRole('button', { name: 'Open Saved Results', exact: true })
        .click();
      await expect(selection).toContainText('Shortlist #1');
      await expect(page.getByRole('timer')).toHaveText(time!);
      await expect(page.locator('main [role=alert]')).toHaveCount(0);
    } else {
      await expect(page.locator('main [role=alert]')).toHaveCount(0);
      await page.reload();
      await page
        .getByRole('button', { name: 'Open Saved Results', exact: true })
        .click();
      await expect(selection).toContainText(
        mode === 'no shortlist' ? '6qjh.pdb' : '2beg.pdb'
      );
      await expect(
        history.getByRole('button', { name: 'Completed 1', exact: true })
      ).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
