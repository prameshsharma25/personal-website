/** Real browser benchmark. Public fixtures only; no uploads or email requests. */
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    );
  return value;
}

async function main() {
  const output = path.resolve(
    process.env.BENCHMARK_OUTPUT || '.local/descriptor-benchmark'
  );
  const counts = (process.env.BENCHMARK_WORKERS || '1,2,4')
    .split(',')
    .map(Number);
  const repeats = Number(process.env.BENCHMARK_REPEATS || 3);
  const fileCount = Number(process.env.BENCHMARK_FILES || 12);
  const compare = process.env.BENCHMARK_COMPARE === 'true';
  if (
    counts.some((value) => ![1, 2, 4].includes(value)) ||
    !Number.isInteger(repeats) ||
    repeats < 1 ||
    !Number.isInteger(fileCount) ||
    fileCount < 4 ||
    fileCount > 125
  )
    throw new Error('Invalid benchmark settings.');
  await mkdir(output, { recursive: true });
  const sources = await Promise.all(
    ['2beg.pdb', '6qjh.pdb'].map((name) =>
      readFile(`public/tools/amyloid-example/${name}`)
    )
  );
  const files = Array.from({ length: fileCount }, (_, index) => ({
    name: `benchmark-${String(index + 1).padStart(3, '0')}.pdb`,
    mimeType: 'text/plain',
    buffer: sources[index % sources.length],
  }));
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const records: any[] = [];
  let baseline: any;
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const original = window.Worker;
    const state: any = {
      workers: [],
      samples: [],
      started: null,
      elapsedMs: null,
      maxInterfaceDelayMs: 0,
      result: null,
    };
    (window as any).__benchmark = state;
    let expected = performance.now() + 250;
    setInterval(() => {
      const now = performance.now();
      if (state.started !== null && state.elapsedMs === null)
        state.maxInterfaceDelayMs = Math.max(
          state.maxInterfaceDelayMs,
          now - expected
        );
      expected = now + 250;
    }, 250);
    window.Worker = class extends original {
      record: any;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.record = { name: options?.name, terminated: false };
        state.workers.push(this.record);
        if (
          options?.name === 'amyloid-mmalign' &&
          state.workers.some(
            (item: any) =>
              item.name === 'amyloid-descriptors' && !item.terminated
          )
        )
          state.overlappingPools = true;
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'diagnostics') state.samples.push(data.diagnostics);
          if (data.type === 'complete') {
            state.elapsedMs = performance.now() - state.started;
            state.result = data.result;
          }
        });
      }
      postMessage(data: any, transfer: any = []) {
        if (data.type === 'start') state.started = performance.now();
        super.postMessage(data, transfer);
      }
      terminate() {
        this.record.terminated = true;
        super.terminate();
      }
    };
  });
  const page = await context.newPage();
  const errors: string[] = [],
    writes: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
  });
  const environment = {
    date: new Date().toISOString(),
    browser: browser.version(),
    cpu: os.cpus()[0]?.model,
    logicalCores: os.cpus().length,
    physicalMemoryBytes: os.totalmem(),
    platform: `${os.platform()} ${os.arch()}`,
    fileCount,
    compare,
    repeats,
    sources: sources.map((bytes, index) => ({
      name: ['2beg.pdb', '6qjh.pdb'][index],
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    })),
    scope:
      'Repeated public predicted-coordinate fixtures. Warm browser cache after one unmeasured run. New worker runtimes for every run. No private structures. Memory is sampled Python WASM allocation, not total process RAM. Setup, merging and export are included in end-to-end wall time. No general speedup guarantee.',
  };
  async function run(count: number, round: number, warmup = false) {
    await page.goto(
      new URL(
        '/tools/amyloid-inspector',
        process.env.TEST_BASE_URL || 'http://127.0.0.1:3844'
      ).href
    );
    const target = page.getByLabel('Choose Structures', { exact: true });
    await expect(target).toBeEnabled();
    await target.setInputFiles(warmup ? files.slice(0, 4) : files);
    await page
      .getByRole('combobox', { name: 'Descriptor Workers', exact: true })
      .selectOption(String(count));
    if (!compare || warmup)
      await page.getByLabel('Compare And Cluster Structures').uncheck();
    else {
      await page.getByLabel('Minimum Cluster Size', { exact: true }).fill('2');
      await page.getByLabel('Minimum Samples', { exact: true }).fill('1');
      await page
        .getByRole('combobox', { name: 'Parallel Workers', exact: true })
        .selectOption('2');
    }
    await page
      .getByRole('button', { name: 'Analyze On My Device', exact: true })
      .click();
    const deadline = Date.now() + 600000;
    while (
      !(await page
        .getByRole('button', { name: 'Download Local Reports', exact: true })
        .count())
    ) {
      const alert = page.locator('main [role="alert"]');
      if (await alert.count()) throw new Error(await alert.first().innerText());
      if (Date.now() > deadline) throw new Error('Benchmark timed out');
      await page.waitForTimeout(250);
    }
    const state = await page.evaluate(() => (window as any).__benchmark);
    expect(state.workers.every((worker: any) => worker.terminated)).toBe(true);
    expect(state.overlappingPools).toBeFalsy();
    expect(
      state.result.structures.every((model: any) => model.state === 'complete')
    ).toBe(true);
    expect(state.result.descriptor_execution.workers).toBe(count);
    expect(state.result.descriptor_execution.fallback).toBeNull();
    if (warmup) {
      console.log('Unmeasured cache warmup complete.');
      return;
    }
    const filename = path.join(output, `round-${round}-workers-${count}.zip`);
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download Local Reports', exact: true })
      .click();
    await (await download).saveAs(filename);
    const scientific = JSON.parse(
      execFileSync(
        'python3',
        ['scripts/check-amyloid-benchmark.py', filename],
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      )
    );
    if (baseline) expect(scientific).toEqual(baseline);
    else baseline = scientific;
    const descriptor = state.result.descriptor_execution;
    const record = {
      round,
      workers: count,
      ...descriptor,
      end_to_end_seconds: state.elapsedMs / 1000,
      sampled_peak_python_mib:
        Math.max(
          ...state.samples.map((item: any) => item.peakPythonMemoryBytes || 0)
        ) /
        1024 ** 2,
      max_interface_delay_ms: state.maxInterfaceDelayMs,
      peak_active_descriptors: Math.max(
        ...state.samples.map(
          (item: any) => item.descriptorPool?.peakActive || 0
        )
      ),
      scientific_sha256: createHash('sha256')
        .update(JSON.stringify(canonical(scientific)))
        .digest('hex'),
      archive: path.basename(filename),
    };
    records.push(record);
    await writeFile(
      path.join(output, 'measurements.json'),
      JSON.stringify({ environment, records }, null, 2) + '\n'
    );
    console.log(
      JSON.stringify({
        round,
        workers: count,
        descriptor_seconds: descriptor.calculation_seconds,
        total_seconds: record.end_to_end_seconds,
        peak_python_mib: record.sampled_peak_python_mib,
        scientific_match: true,
      })
    );
    await page
      .getByRole('region', { name: 'Live Diagnostics', exact: true })
      .screenshot({ path: path.join(output, `diagnostics-${count}.png`) });
  }
  try {
    await run(1, 0, true);
    for (let round = 1; round <= repeats; round++) {
      const order = counts.slice(round - 1).concat(counts.slice(0, round - 1));
      for (const count of order) await run(count, round);
    }
    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
    const median = (items: number[]) => {
      const sorted = items.slice().sort((a, b) => a - b);
      const m = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
    };
    const medians = counts.map((count) => ({
      workers: count,
      descriptor_seconds: median(
        records
          .filter((r) => r.workers === count)
          .map((r) => r.calculation_seconds)
      ),
      total_seconds: median(
        records
          .filter((r) => r.workers === count)
          .map((r) => r.end_to_end_seconds)
      ),
      peak_python_mib: median(
        records
          .filter((r) => r.workers === count)
          .map((r) => r.sampled_peak_python_mib)
      ),
    }));
    await writeFile(
      path.join(output, 'summary.json'),
      JSON.stringify(
        {
          environment,
          medians,
          scientific_parity: true,
          all_workers_terminated: true,
          no_uploads: true,
        },
        null,
        2
      ) + '\n'
    );
    console.log(JSON.stringify({ medians }, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
