import { test, expect, type Page } from '@playwright/test';

const moduleURL = '/tools/amyloid-device/v1/checkpoints.mjs';
async function history(page: Page) {
  return page.evaluate(
    async (url) => (await import(url)).listCheckpoints(),
    moduleURL
  );
}

// Deterministic worker: real checkpoint storage and locks, no scientific work.
// The recovery suite separately exercises actual Python and MM-align workers.
test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (options?.name === 'amyloid-on-device')
          (window as any).__timerWorker = this;
      }
    };
  });
  await page.route('**/amyloid-device/v1/worker.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
      import { openCheckpoint } from './checkpoints.mjs';
      onmessage = async ({data}) => {
        if (data.type !== 'start') return;
        if (data.checkpoint) {
          const engine = await (await fetch('./engine.json')).json();
          const {files, confidence, compare, settings, descriptorWorkers, alignmentWorkers} = data;
          const session = await openCheckpoint(
            {files, confidence, compare, settings, descriptorWorkers, alignmentWorkers},
            engine, data.resumeId, data.checkpointId
          );
          postMessage({type:'checkpoint', summary:session.meta});
        }
        postMessage({type:'progress',stage:'Calculating Test Structures',phase:'descriptors',completed:0,total:1});
      };
    `,
    })
  );
  await page.goto('/tools/amyloid-inspector');
  await expect(
    page.getByRole('region', { name: 'Run History', exact: true })
  ).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
});

async function start(page: Page) {
  await page
    .getByLabel('Choose Structures', { exact: true })
    .setInputFiles('public/tools/amyloid-example/2beg.pdb');
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Calculating Test Structures' })
  ).toBeVisible();
}

test('pause freezes the timer and resume preserves active time across reloads and failures', async ({
  page,
}) => {
  await start(page);
  const timer = page.getByRole('timer', { name: 'Active Analysis Time' });
  await page.clock.runFor(5400);
  await page
    .getByRole('button', { name: 'Pause Analysis', exact: true })
    .click();
  await expect(timer).toHaveText('0:05 Elapsed');
  await expect.poll(async () => (await history(page))[0]?.elapsedMs).toBe(5400);
  await page.clock.runFor(120000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(timer).toHaveText('0:05 Elapsed');
  await page.reload();
  await page
    .getByRole('button', { name: 'Open 2beg.pdb, Paused', exact: true })
    .click();
  await expect(timer).toHaveText('0:05 Elapsed');
  await page.clock.runFor(30000);
  await expect(timer).toHaveText('0:05 Elapsed');
  await page
    .getByRole('button', { name: 'Resume Saved Run', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Calculating Test Structures' })
  ).toBeVisible();
  await expect(timer).toHaveText('0:05 Elapsed');
  await page.clock.runFor(2700);
  await page.evaluate(() =>
    (window as any).__timerWorker.dispatchEvent(
      new ErrorEvent('error', { cancelable: true })
    )
  );
  await expect.poll(async () => (await history(page))[0]?.elapsedMs).toBe(8100);
  await expect(timer).toHaveText('0:08 Elapsed');
  await page.clock.runFor(20000);
  await expect(timer).toHaveText('0:08 Elapsed');
  await page
    .getByRole('button', { name: 'Resume Saved Run', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Calculating Test Structures' })
  ).toBeVisible();
  await page.clock.runFor(1000);
  await page
    .getByRole('button', { name: 'Pause Analysis', exact: true })
    .click();
  await expect.poll(async () => (await history(page))[0]?.elapsedMs).toBe(9100);
  await page.getByRole('button', { name: 'New Analysis', exact: true }).click();
  await expect(timer).toHaveCount(0);
  await page.getByLabel('Save Progress On This Device').uncheck();
  await start(page);
  await expect(timer).toHaveText('0:00 Elapsed');
  await page.clock.runFor(2000);
  await page
    .getByRole('button', { name: 'Cancel Analysis', exact: true })
    .click();
  await page.clock.runFor(15000);
  await expect(timer).toHaveText('0:02 Elapsed');
  expect((await history(page)).map((run) => run.elapsedMs)).toEqual([9100]);
});

test('a page interruption recovers the last saved active time without adding offline time', async ({
  page,
}) => {
  await start(page);
  await page.clock.runFor(12400);
  await expect
    .poll(async () => (await history(page))[0]?.elapsedMs)
    .toBe(12000);
  await page.reload();
  await page.clock.runFor(300000);
  await page
    .getByRole('button', { name: 'Open 2beg.pdb, Paused', exact: true })
    .click();
  const timer = page.getByRole('timer', { name: 'Active Analysis Time' });
  await expect(timer).toHaveText('0:12 Elapsed');
  await page
    .getByRole('button', { name: 'Resume Saved Run', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Calculating Test Structures' })
  ).toBeVisible();
  await page.clock.runFor(3000);
  await page
    .getByRole('button', { name: 'Pause Analysis', exact: true })
    .click();
  await expect(timer).toHaveText('0:15 Elapsed');
  await expect
    .poll(async () => (await history(page))[0]?.elapsedMs)
    .toBe(15000);
});

test('timer writes cannot overwrite paused, completed, or newer attempts', async ({
  page,
}) => {
  const result = await page.evaluate(async (url) => {
    const cp = await import(url);
    const input = {
      files: [{ name: 'clock.pdb', bytes: new Uint8Array([1]).buffer }],
    };
    const engine = { files: {} };
    const session = await cp.openCheckpoint(input, engine);
    const id = session.meta.id;
    const attempt = session.meta.attempt;
    await cp.saveCheckpointElapsed(id, attempt, 5432);
    await cp.saveCheckpointElapsed(id, attempt, 2000);
    const monotonic = (await cp.readCheckpointSummary(id)).elapsedMs;
    await cp.setCheckpointActivity(id, 'paused', '', 5500);
    await cp.saveCheckpointElapsed(id, attempt, 999999);
    const paused = (await cp.readCheckpointSummary(id)).elapsedMs;
    const resumed = await cp.openCheckpoint(input, engine, id);
    await cp.saveCheckpointElapsed(id, attempt, 999999);
    const fenced = (await cp.readCheckpointSummary(id)).elapsedMs;
    await cp.saveCheckpointElapsed(id, resumed.meta.attempt, 6000);
    await resumed.put('completion', 'current', {
      result: { structures: [], groups: [] },
    });
    await cp.saveCheckpointElapsed(id, resumed.meta.attempt, 999999);
    await cp.setCheckpointActivity(id, 'paused', '', 6123);
    const complete = await cp.readCheckpointSummary(id);
    await cp.setCheckpointActivity(id, 'paused'); // Opening saved results is read-only.
    return {
      monotonic,
      paused,
      fenced,
      complete,
      reopened: await cp.readCheckpointSummary(id),
    };
  }, moduleURL);
  expect(result.monotonic).toBe(5432);
  expect(result.paused).toBe(5500);
  expect(result.fenced).toBe(5500);
  expect(result.complete.elapsedMs).toBe(6123);
  expect(result.complete.status).toBe('complete');
  expect(result.reopened).toEqual(result.complete);
});
