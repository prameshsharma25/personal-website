import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('cancelling during alignment terminates the coordinator and every pool worker, then a new run succeeds', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8 });
    const WorkerClass = window.Worker;
    (window as any).__workers = [];
    (window as any).__pairs = 0;
    window.Worker = class extends WorkerClass {
      record: any;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.record = { name: options?.name, terminated: false };
        (window as any).__workers.push(this.record);
      }
      postMessage(message: any, transfer: any = []) {
        if (message.type === 'align') (window as any).__pairs++;
        super.postMessage(message, transfer);
      }
      terminate() {
        this.record.terminated = true;
        super.terminate();
      }
    };
  });
  const original = await readFile('public/tools/amyloid-example/2beg.pdb');
  const files = Array.from({ length: 12 }, (_, index) => ({
    name: `cancel-${index}.pdb`,
    mimeType: 'text/plain',
    buffer: original,
  }));
  await page.goto('/tools/amyloid-inspector');
  await page
    .getByLabel('Save Progress On This Device', { exact: true })
    .uncheck();
  await page
    .getByLabel('Choose Structures', { exact: true })
    .setInputFiles(files);
  await page
    .getByRole('combobox', { name: 'Parallel Workers', exact: true })
    .selectOption('4');
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__pairs), {
      timeout: 120000,
    })
    .toBeGreaterThanOrEqual(4);
  await expect(
    page.getByRole('combobox', { name: 'Parallel Workers', exact: true })
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Cancel Analysis', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Cancelled');
  const children = await page.evaluate(() => (window as any).__workers);
  expect(
    children.filter((worker) => worker.name === 'amyloid-mmalign')
  ).toHaveLength(4);
  expect(children.every((worker) => worker.terminated)).toBe(true);
  await page
    .getByLabel('Choose Structures', { exact: true })
    .setInputFiles(files.slice(0, 2));
  await page
    .getByRole('combobox', { name: 'Parallel Workers', exact: true })
    .selectOption('1');
  await page
    .getByRole('button', { name: 'Analyze On My Device', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Download Local Reports', exact: true })
  ).toBeVisible({ timeout: 60000 });
  expect(
    await page.evaluate(() =>
      (window as any).__workers.every((worker) => worker.terminated)
    )
  ).toBe(true);
});
