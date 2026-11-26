import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AlignmentPool,
  resolveAlignmentWorkers,
} from '../lib/amyloid-alignment-pool';
import { scheduleAlignments } from '../public/tools/amyloid-device/v1/alignment-scheduler.mjs';
import { createDiagnostics } from '../public/tools/amyloid-device/v1/diagnostics.mjs';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
test('worker choices leave headroom in Auto and respect task/core limits', () => {
  assert.equal(resolveAlignmentWorkers('auto', 8, 100), 2);
  assert.equal(resolveAlignmentWorkers('auto', 2, 100), 1);
  assert.equal(resolveAlignmentWorkers(4, 2, 100), 2);
  assert.equal(resolveAlignmentWorkers(4, 8, 1), 1);
  assert.equal(resolveAlignmentWorkers('auto', NaN, 100), 1);
  assert.throws(() => resolveAlignmentWorkers(100 as any, 8, 100));
});

test('scheduler bounds outstanding work and serializes Python acceptance despite out-of-order completions', async () => {
  const tasks = Array.from({ length: 12 }, (_, index) => ({
    index,
    group: 'a',
  }));
  let executing = 0,
    maximum = 0,
    accepting = 0;
  const accepted: number[] = [],
    progress: number[] = [];
  await scheduleAlignments(
    tasks,
    4,
    async (task) => {
      maximum = Math.max(maximum, ++executing);
      await sleep(task.index === 0 ? 30 : 1);
      executing--;
      return { stdout: String(task.index), error: '', elapsedMs: 1 };
    },
    async (task, result) => {
      assert.equal(++accepting, 1);
      await sleep(1);
      assert.equal(result.stdout, String(task.index));
      accepted.push(task.index);
      accepting--;
      return false;
    },
    (_, __, done) => progress.push(done)
  );
  assert.equal(maximum, 4);
  assert.notEqual(accepted[0], 0);
  assert.deepEqual(
    accepted.slice().sort((a, b) => a - b),
    tasks.map((task) => task.index)
  );
  assert.deepEqual(
    progress,
    Array.from({ length: 12 }, (_, i) => i + 1)
  );
});

test('failed groups skip unscheduled comparisons without invalidating other groups or inflating completed calls', async () => {
  const tasks = [
    ...Array.from({ length: 8 }, (_, index) => ({ index, group: 'bad' })),
    ...Array.from({ length: 3 }, (_, index) => ({ index, group: 'good' })),
  ];
  const good: number[] = [],
    skips: string[] = [];
  await scheduleAlignments(
    tasks,
    2,
    async (task) => {
      if (task.group === 'bad') throw new Error('timeout');
      good.push(task.index);
      return { stdout: 'ok', error: '', elapsedMs: 1 };
    },
    async (_, result) => Boolean(result.error),
    (task, result) => {
      if (result.skipped) skips.push(task.group);
    }
  );
  assert.deepEqual(good, [0, 1, 2]);
  assert.equal(skips.length, 6);
  assert.ok(skips.every((group) => group === 'bad'));
});

class FakeWorker {
  onmessage: any;
  onerror: any;
  onmessageerror: any;
  terminated = false;
  constructor(
    private behavior: 'normal' | 'startup-fail' | 'hang' | 'crash' = 'normal'
  ) {}
  postMessage(data: any) {
    if (data.type === 'init')
      queueMicrotask(() => {
        if (this.terminated) return;
        if (this.behavior === 'startup-fail')
          this.onerror?.({ preventDefault() {} });
        else this.onmessage?.({ data: { type: 'ready' } });
      });
    else if (this.behavior === 'crash')
      queueMicrotask(() => this.onerror?.({ preventDefault() {} }));
    else if (this.behavior !== 'hang')
      setTimeout(() => {
        if (!this.terminated)
          this.onmessage?.({
            data: {
              type: 'result',
              stdout: 'alignment',
              error: '',
              elapsedMs: 2,
            },
          });
      }, 2);
  }
  terminate() {
    this.terminated = true;
  }
}

test('pool startup failure falls back to one worker and disposes the partially started pool', async () => {
  const children: FakeWorker[] = [];
  const pool = new AlignmentPool(new ArrayBuffer(1), new ArrayBuffer(1), {
    createWorker: () => {
      const worker = new FakeWorker(
        children.length === 1 ? 'startup-fail' : 'normal'
      );
      children.push(worker);
      return worker as any;
    },
  });
  const started = await pool.initialize(4);
  assert.equal(started.workers, 1);
  assert.ok(started.fallback);
  assert.ok(children.slice(0, 4).every((worker) => worker.terminated));
  assert.equal(
    (await pool.run(new ArrayBuffer(1), new ArrayBuffer(1))).stdout,
    'alignment'
  );
  pool.dispose();
  assert.ok(children.every((worker) => worker.terminated));
});

for (const failure of ['hang', 'crash'] as const)
  test(`pool replaces a ${failure === 'hang' ? 'timed-out' : 'crashed'} worker and cancellation stops every slot`, async () => {
    const children: FakeWorker[] = [],
      states: any[] = [];
    const pool = new AlignmentPool(new ArrayBuffer(1), new ArrayBuffer(1), {
      createWorker: () => {
        const worker = new FakeWorker(
          children.length === 0 ? failure : 'normal'
        );
        children.push(worker);
        return worker as any;
      },
      pairTimeoutMs: 20,
      onState: (state) => states.push(state),
    });
    await pool.initialize(2);
    const result = await Promise.all([
      pool.run(new ArrayBuffer(1), new ArrayBuffer(1)),
      pool.run(new ArrayBuffer(1), new ArrayBuffer(1)),
    ]);
    assert.ok(result[0].error);
    assert.equal(result[1].error, '');
    assert.ok(children[0].terminated);
    assert.equal(
      (await pool.run(new ArrayBuffer(1), new ArrayBuffer(1))).error,
      ''
    );
    const pending = pool.run(new ArrayBuffer(1), new ArrayBuffer(1));
    pool.dispose();
    assert.ok((await pending).error);
    assert.ok(children.every((worker) => worker.terminated));
    assert.equal(states.at(-1).active, 0);
    assert.equal(states.at(-1).peakActive, 2);
    await assert.rejects(
      pool.run(new ArrayBuffer(1), new ArrayBuffer(1)),
      /cancelled/
    );
  });

test('parallel ETA follows aggregate completion rate rather than summing per-task durations', () => {
  let now = 0;
  const metrics = createDiagnostics(() => now);
  metrics.phase('alignment', 12);
  metrics.pool({ size: 4, active: 4, peakActive: 4, stopped: false });
  now = 1000;
  for (let i = 0; i < 4; i++) metrics.operation(1000);
  assert.equal(metrics.snapshot().stage.remainingMs, 2000);
  assert.equal(metrics.snapshot().stage.ratePerMinute, 240);
  assert.equal(metrics.snapshot().alignmentPool.active, 4);
});
