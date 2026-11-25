import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DescriptorPool,
  resolveDescriptorWorkers,
} from '../lib/amyloid-descriptor-pool';
import { scheduleDescriptors } from '../public/tools/amyloid-device/v1/descriptor-scheduler.mjs';
import { createDiagnostics } from '../public/tools/amyloid-device/v1/diagnostics.mjs';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const config = {
  engine: {},
  packageBytes: new ArrayBuffer(1),
  analysisBytes: new ArrayBuffer(1),
};
const entry = {
  id: 'model-001',
  filename: 'test.pdb',
  stored_name: 'model-001.pdb',
};

test('descriptor concurrency respects input count, cores, and conservative Auto memory policy', () => {
  assert.equal(resolveDescriptorWorkers('auto', 8, 12, 8), 2);
  assert.equal(resolveDescriptorWorkers('auto', 8, 12, 4), 1);
  assert.equal(resolveDescriptorWorkers('auto', 8, 3, 8), 1);
  assert.equal(resolveDescriptorWorkers(4, 2, 12, 8), 2);
  assert.equal(resolveDescriptorWorkers(4, 8, 1, 8), 1);
  assert.equal(resolveDescriptorWorkers('auto', NaN, 12, undefined), 1);
  assert.throws(() => resolveDescriptorWorkers(99, 8, 12, 8));
});

test('descriptor queue bounds concurrency and returns original ordering after uneven completion', async () => {
  let active = 0,
    peak = 0;
  const finished: number[] = [];
  const result = await scheduleDescriptors(
    [0, 1, 2, 3, 4, 5],
    4,
    async (value) => {
      peak = Math.max(peak, ++active);
      await pause(value === 0 ? 30 : 1);
      active--;
      return value;
    },
    (_, index) => finished.push(index)
  );
  assert.equal(peak, 4);
  assert.notEqual(finished[0], 0);
  assert.deepEqual(result, [0, 1, 2, 3, 4, 5]);
});

test('a fatal worker error stops scheduling new structures', async () => {
  const started: number[] = [];
  await assert.rejects(
    scheduleDescriptors(
      [0, 1, 2, 3, 4, 5],
      2,
      async (value) => {
        started.push(value);
        if (value === 0) throw new Error('worker crash');
        await pause(10);
        return value;
      },
      () => {}
    ),
    /worker crash/
  );
  await pause(20);
  assert.deepEqual(started, [0, 1]);
});

class FakeWorker {
  onmessage: any;
  onerror: any;
  onmessageerror: any;
  terminated = false;
  constructor(private mode = 'normal') {}
  postMessage(data: any) {
    queueMicrotask(() => {
      if (this.terminated) return;
      if (data.type === 'init') {
        if (this.mode === 'startup') this.onerror?.({ preventDefault() {} });
        else this.onmessage?.({ data: { type: 'ready', memoryBytes: 100 } });
      } else if (this.mode === 'crash') this.onerror?.({ preventDefault() {} });
      else if (this.mode !== 'hang') {
        this.onmessage?.({
          data: {
            type: 'progress',
            stage: 'Geometry',
            completed: 2,
            memoryBytes: 200,
          },
        });
        this.onmessage?.({
          data: {
            type: 'result',
            model: { id: data.entry.id },
            artifacts: [],
            elapsedMs: 2,
            memoryBytes: 200,
          },
        });
      }
    });
  }
  terminate() {
    this.terminated = true;
  }
}

test('descriptor startup failure terminates the partial pool and retries with one runtime', async () => {
  const children: FakeWorker[] = [],
    states: any[] = [],
    progress: number[] = [];
  const pool = new DescriptorPool(config, {
    createWorker: () => {
      const worker = new FakeWorker(
        children.length === 1 ? 'startup' : 'normal'
      );
      children.push(worker);
      return worker as any;
    },
    onState: (state) => states.push(state),
    onProgress: (index) => progress.push(index),
  });
  const result = await pool.initialize(4);
  assert.equal(result.workers, 1);
  assert.ok(result.fallback);
  assert.ok(children.slice(0, 4).every((worker) => worker.terminated));
  const model = await pool.run(entry, new ArrayBuffer(1), 7);
  assert.equal(model.model.id, entry.id);
  assert.deepEqual(progress, [7]);
  assert.ok(states.some((state) => state.memoryBytes > 0));
  pool.dispose();
  assert.equal(states.at(-1).memoryBytes, 0);
  assert.ok(states.at(-1).peakMemoryBytes > 0);
  assert.ok(children.every((worker) => worker.terminated));
});

for (const mode of ['hang', 'crash'])
  test(`a ${mode} fails explicitly and terminates all descriptor workers`, async () => {
    const children: FakeWorker[] = [];
    const pool = new DescriptorPool(config, {
      taskTimeoutMs: 15,
      createWorker: () => {
        const worker = new FakeWorker(mode);
        children.push(worker);
        return worker as any;
      },
    });
    await pool.initialize(2);
    await assert.rejects(pool.run(entry, new ArrayBuffer(1), 0));
    assert.ok(children.every((worker) => worker.terminated));
    await assert.rejects(pool.run(entry, new ArrayBuffer(1), 1), /cancelled/);
  });

test('cancellation rejects pending work and prevents late completion', async () => {
  const children: FakeWorker[] = [];
  const pool = new DescriptorPool(config, {
    createWorker: () => {
      const worker = new FakeWorker('hang');
      children.push(worker);
      return worker as any;
    },
  });
  await pool.initialize(2);
  const pending = pool.run(entry, new ArrayBuffer(1), 0);
  pool.dispose();
  await assert.rejects(pending, /cancelled/);
  assert.ok(children.every((worker) => worker.terminated));
});

test('diagnostics aggregate descriptor memory without losing its peak when the pool stops', () => {
  const metrics = createDiagnostics();
  metrics.descriptors({
    size: 2,
    active: 2,
    peakActive: 2,
    stopped: false,
    memoryBytes: 600,
    peakMemoryBytes: 600,
  });
  assert.equal(metrics.snapshot().pythonMemoryBytes, 600);
  metrics.descriptors({
    size: 2,
    active: 0,
    peakActive: 2,
    stopped: true,
    memoryBytes: 0,
    peakMemoryBytes: 600,
  });
  metrics.memory(250);
  assert.equal(metrics.snapshot().pythonMemoryBytes, 250);
  assert.equal(metrics.snapshot().peakPythonMemoryBytes, 600);
});

test('an idle worker crash fails the next request immediately', async () => {
  const child = new FakeWorker();
  const pool = new DescriptorPool(config, { createWorker: () => child as any });
  await pool.initialize(1);
  child.onerror({ preventDefault() {} });
  await assert.rejects(pool.run(entry, new ArrayBuffer(1), 0), /unexpectedly/);
  assert.equal(child.terminated, true);
});

test('worker constructor failure releases already constructed workers before fallback', async () => {
  const children: FakeWorker[] = [];
  let calls = 0;
  const pool = new DescriptorPool(config, {
    createWorker: () => {
      if (++calls === 2) throw new Error('Browser refused another worker');
      const child = new FakeWorker();
      children.push(child);
      return child as any;
    },
  });
  const result = await pool.initialize(4);
  assert.equal(result.workers, 1);
  assert.equal(children[0].terminated, true);
  pool.dispose();
  assert.ok(children.every((child) => child.terminated));
});
