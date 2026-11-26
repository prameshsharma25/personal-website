import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const previousEngine =
  'acca2062d11b6d058bf29861264436255671ab7e369757137b03a5825cb13104';

test('real worker accepts supported budgets and rejects unsupported values before calculation', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/privacy');
  const results = await page.evaluate(async () => {
    const store = await import(
      String('/tools/amyloid-device/v1/checkpoints.mjs')
    );
    const bytes = await (
      await fetch('/tools/amyloid-example/2beg.pdb')
    ).arrayBuffer();
    const output = [];
    for (const budget of [5, 10, 15, 20, 0, 6, 21, '20', null]) {
      const worker = new Worker('/tools/amyloid-device/v1/worker.mjs', {
        type: 'module',
      });
      const reply: any = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error('Budget validation timed out'));
        }, 15000);
        worker.onmessage = ({ data }) => {
          if (
            !['checkpoint', 'error', 'checkpoint-warning'].includes(data.type)
          )
            return;
          clearTimeout(timer);
          worker.terminate();
          resolve(data);
        };
        worker.onerror = (event) => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error(event.message));
        };
        worker.postMessage({
          type: 'start',
          files: [{ name: 'test.pdb', bytes }],
          compare: true,
          checkpoint: true,
          checkpointId: crypto.randomUUID(),
          settings: {
            min_cluster_size: 2,
            min_samples: 1,
            max_candidates: budget,
          },
        });
      });
      if (reply.type === 'checkpoint') {
        const input = await store.readCheckpointInputs(reply.summary.id);
        output.push({
          budget,
          savedBudget: input.settings.max_candidates,
          type: reply.type,
        });
        await store.deleteCheckpoint(reply.summary.id);
      } else output.push({ budget, type: reply.type, message: reply.message });
    }
    return output;
  });
  for (const result of results) {
    if ([5, 10, 15, 20].includes(result.budget as number)) {
      expect(result.type).toBe('checkpoint');
      expect(result.savedBudget).toBe(result.budget);
    } else {
      expect(result.type).toBe('error');
      expect(result.message).toContain(
        'Choose a candidate budget of 5, 10, 15, or 20.'
      );
    }
  }
});

for (const budget of [10, 20]) {
  test(`budget ${budget} survives interruption, resume, export, and completed run reopening`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    page.on('dialog', (dialog) => dialog.accept());
    await page.addInitScript(() => {
      const Original = window.Worker;
      (window as any).__budgetHalted = false;
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          if (options?.name === 'amyloid-on-device')
            this.addEventListener('message', ({ data }) => {
              if (
                data.type === 'model' &&
                sessionStorage.getItem('budget-stop') === 'yes'
              ) {
                sessionStorage.removeItem('budget-stop');
                (window as any).__budgetHalted = true;
                this.terminate();
              }
            });
        }
      };
    });
    const original = await readFile('public/tools/amyloid-example/2beg.pdb');
    await page.goto('/tools/amyloid-inspector');
    await page.getByLabel('Choose Structures', { exact: true }).setInputFiles([
      { name: 'budget-first.pdb', mimeType: 'text/plain', buffer: original },
      { name: 'budget-second.pdb', mimeType: 'text/plain', buffer: original },
    ]);
    const control = page.getByRole('combobox', {
      name: 'Candidate Budget',
      exact: true,
    });
    await expect(control).toHaveValue('10');
    await expect(control.locator('option')).toHaveText([
      '5 Candidates',
      '10 Candidates',
      '15 Candidates',
      '20 Candidates',
    ]);
    await control.selectOption(String(budget));
    await page
      .getByRole('combobox', { name: 'Descriptor Workers', exact: true })
      .selectOption('1');
    await page
      .getByRole('combobox', { name: 'Parallel Workers', exact: true })
      .selectOption('1');
    await page.getByLabel('Minimum Cluster Size', { exact: true }).fill('2');
    await page.getByLabel('Minimum Samples', { exact: true }).fill('1');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await page.evaluate(() => sessionStorage.setItem('budget-stop', 'yes'));
    await page
      .getByRole('button', { name: 'Analyze On My Device', exact: true })
      .click();
    await expect(control).toBeDisabled();
    await page.waitForFunction(
      () => (window as any).__budgetHalted,
      undefined,
      { timeout: 90000 }
    );
    await page.reload();
    if (budget === 10) {
      // Descriptors are unchanged. Simulate the prior release's saved engine
      // identity to verify an existing Top10 run remains resumable.
      await page.evaluate(async (engineDigest) => {
        const store = await import(
          String('/tools/amyloid-device/v1/checkpoints.mjs')
        );
        const run = (await store.listCheckpoints())[0];
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('amyloid-analysis-checkpoints-v1', 2);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('run', 'readwrite');
            const objectStore = tx.objectStore('run');
            const get = objectStore.get(run.id);
            get.onsuccess = () =>
              objectStore.put({ ...get.result, engineDigest }, run.id);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          };
        });
      }, previousEngine);
    }
    await page
      .getByRole('button', {
        name: 'Open budget-first.pdb + 1 More, Paused',
        exact: true,
      })
      .click();
    await expect(control).toHaveValue(String(budget));
    await page
      .getByRole('button', { name: 'Resume Saved Run', exact: true })
      .click();
    const download = page.getByRole('button', {
      name: 'Download Local Reports',
      exact: true,
    });
    await expect(download).toBeVisible({ timeout: 90000 });
    await expect(control).toHaveValue(String(budget));
    const pending = page.waitForEvent('download');
    await download.click();
    const destination = info.outputPath(`budget-${budget}.zip`);
    await (await pending).saveAs(destination);
    const result = JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          'import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z: print(json.dumps({"result":json.loads(z.read("results.json")),"report":z.read("Run Summary.html").decode()}))',
          destination,
        ],
        { encoding: 'utf8' }
      )
    );
    expect(result.result.settings.max_candidates).toBe(budget);
    expect(result.result.recovery.reused_descriptors).toBeGreaterThanOrEqual(1);
    expect(
      result.result.structures.every((model: any) => model.state === 'complete')
    ).toBe(true);
    expect(result.report).toContain('max_candidates');
    await page.reload();
    await page
      .getByRole('button', {
        name: 'Open budget-first.pdb + 1 More, Completed',
        exact: true,
      })
      .click();
    await expect(download).toBeVisible();
    await expect(control).toHaveValue(String(budget));
    expect(await page.locator('main [role=alert]').allTextContents()).toEqual(
      []
    );
  });
}
