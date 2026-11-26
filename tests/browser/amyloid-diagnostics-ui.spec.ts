import { test, expect } from '@playwright/test';
import type { DeviceDiagnostics } from '../../lib/amyloid-diagnostics';

// Controlled telemetry tests presentation and scrolling without doing 125
// scientific calculations. Real engine coverage remains in amyloid-batch-device.
test('large live results scroll independently and gauges follow engine samples', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      constructor(url: string | URL, options?: WorkerOptions) {
        if (!String(url).endsWith('/amyloid-device/v1/worker.mjs'))
          return new Original(url, options);
        (window as any).__emitAnalysis = (data: unknown) =>
          this.onmessage?.({ data });
      }
      postMessage(
        _message: unknown,
        _options?: Transferable[] | StructuredSerializeOptions
      ) {}
      terminate() {}
    } as unknown as typeof Worker;
  });
  await page.goto('/tools/amyloid-inspector');
  await page.getByLabel('Choose Structures', { exact: true }).setInputFiles(
    Array.from({ length: 125 }, (_, i) => ({
      name: `structure-${String(i + 1).padStart(3, '0')}.pdb`,
      mimeType: 'text/plain',
      buffer: Buffer.from('TEST FIXTURE'),
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
  await expect(diagnostics.getByRole('meter')).toHaveCount(0);
  await expect(diagnostics).toContainText('Unavailable');
  const models = Array.from({ length: 125 }, (_, i) => ({
    id: `model-${String(i + 1).padStart(3, '0')}`,
    filename: `structure-${String(i + 1).padStart(3, '0')}.pdb`,
    state: 'failed',
    error: 'Invalid coordinates in test fixture',
  }));
  const sample: DeviceDiagnostics = {
    descriptorPool: {
      size: 4,
      active: 3,
      peakActive: 4,
      stopped: false,
      memoryBytes: 67108864,
      peakMemoryBytes: 134217728,
    },
    alignmentPool: { size: 0, active: 0, peakActive: 0, stopped: false },
    elapsedMs: 120000,
    phase: 'descriptors',
    stage: {
      phase: 'descriptors',
      total: 125,
      completed: 118,
      skipped: 2,
      failed: 3,
      elapsedMs: 120000,
      lastMs: 2500,
      meanMs: 3000,
      ratePerMinute: 60,
      remainingMs: 5000,
    },
    pythonMemoryBytes: 67108864,
    peakPythonMemoryBytes: 134217728,
    network: {
      supported: true,
      requests: 12,
      measuredRequests: 10,
      unmeasuredRequests: 2,
      cachedRequests: 3,
      transferBytes: 16777216,
      bytesPerSecond: 2097152,
    },
  };
  await page.evaluate(
    ({ sample, models }) => {
      (window as any).__emitAnalysis({
        type: 'diagnostics',
        diagnostics: sample,
      });
      for (const model of models)
        (window as any).__emitAnalysis({ type: 'model', model });
    },
    { sample, models: models.slice(0, 120) }
  );
  const descriptor = diagnostics.getByRole('meter', {
    name: 'Descriptor Worker Activity',
    exact: true,
  });
  const stage = diagnostics.getByRole('meter', {
    name: 'Current Stage Progress',
    exact: true,
  });
  const memory = diagnostics.getByRole('meter', {
    name: 'Python Memory Relative To Sampled Peak',
    exact: true,
  });
  await expect(descriptor).toHaveAttribute('aria-valuenow', '3');
  await expect(descriptor).toHaveAttribute('aria-valuemax', '4');
  await expect(descriptor.locator('svg path').last()).toHaveAttribute(
    'stroke-dashoffset',
    '25'
  );
  await expect(stage).toHaveAttribute('aria-valuenow', '120');
  await expect(stage).toContainText('96%');
  await expect(memory).toHaveAttribute('aria-valuemax', '134217728');
  await expect(memory).toContainText('64.0 MiB');
  await expect(memory.locator('svg path').last()).toHaveAttribute(
    'stroke-dashoffset',
    '50'
  );
  await expect(diagnostics).toContainText('not your device capacity');
  await diagnostics.screenshot({
    path: testInfo.outputPath('gauges-desktop.png'),
    animations: 'disabled',
  });
  const results = page.getByRole('region', {
    name: 'Scrollable Structure Results',
    exact: true,
  });
  await expect(results.getByRole('row')).toHaveCount(121);
  const dimensions = await results.evaluate((el) => ({
    height: el.clientHeight,
    scroll: el.scrollHeight,
    limit: innerHeight * 0.6,
  }));
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.limit + 1);
  expect(dimensions.scroll).toBeGreaterThan(dimensions.height * 5);
  await results.focus();
  await page.keyboard.press('PageDown');
  await expect
    .poll(() => results.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  // Let the browser finish its native PageDown animation before pinning a
  // position to check that incoming results do not move the viewport.
  await page.waitForTimeout(300);
  await results.evaluate((el) => {
    el.scrollTop = 400;
  });
  const header = results.getByRole('columnheader', {
    name: 'Structure',
    exact: true,
  });
  expect(
    Math.abs((await header.boundingBox())!.y - (await results.boundingBox())!.y)
  ).toBeLessThan(3);
  await page.evaluate((models) => {
    for (const model of models)
      (window as any).__emitAnalysis({ type: 'model', model });
  }, models.slice(120));
  await expect(results.getByRole('row')).toHaveCount(126);
  expect(await results.evaluate((el) => el.scrollTop)).toBe(400);
  await results.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    results.getByRole('rowheader', { name: 'structure-125.pdb' })
  ).toBeInViewport();
  await results.screenshot({
    path: testInfo.outputPath('scrollable-results.png'),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await diagnostics.screenshot({
    path: testInfo.outputPath('gauges-mobile.png'),
    animations: 'disabled',
  });
  // A stage change resets the progress range and stops the previous worker gauge.
  sample.descriptorPool!.stopped = true;
  sample.alignmentPool = { size: 2, active: 2, peakActive: 2, stopped: false };
  sample.stage = {
    ...sample.stage!,
    phase: 'alignment',
    total: 100,
    completed: 10,
    skipped: 0,
  };
  await page.evaluate(
    (sample) =>
      (window as any).__emitAnalysis({
        type: 'diagnostics',
        diagnostics: sample,
      }),
    sample
  );
  await expect(descriptor).toHaveAttribute('aria-valuenow', '0');
  await expect(stage).toHaveAttribute('aria-valuemax', '100');
  await expect(stage).toContainText('10%');
  const alignment = diagnostics.getByRole('meter', {
    name: 'Alignment Worker Activity',
    exact: true,
  });
  await expect(alignment).toHaveAttribute('aria-valuenow', '2');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await alignment
      .locator('svg path')
      .last()
      .evaluate((el) => getComputedStyle(el).transitionDuration)
  ).toBe('0s');
  await page.evaluate(
    (models) =>
      (window as any).__emitAnalysis({
        type: 'complete',
        result: {
          structures: models,
          groups: [],
          warnings: [],
          elapsed_seconds: 125,
          clustering_status: 'not_requested',
        },
        artifacts: {},
        archive: new ArrayBuffer(0),
      }),
    models
  );
  await expect(
    page.getByRole('button', { name: 'Download Local Reports', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your Structure Assessments' })
  ).toBeVisible();
  await expect(alignment).toHaveAttribute('aria-valuenow', '0');
  await expect(results.getByRole('row')).toHaveCount(126);
  await expect(diagnostics).toContainText('Last measurements from this run.');
  const frozen = await diagnostics.textContent();
  await page.waitForTimeout(1200);
  expect(await diagnostics.textContent()).toBe(frozen);
  expect(errors).toEqual([]);
});
