import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDiagnostics,
  pythonMemoryBytes,
} from '../public/tools/amyloid-device/v1/diagnostics.mjs';
import { formatBytes, formatDuration } from '../lib/amyloid-diagnostics';

test('stage estimates use completed timings, require three samples, exclude skips, and freeze when done', () => {
  let now = 0;
  const metrics = createDiagnostics(() => now);
  metrics.phase('alignment', 10);
  for (let i = 0; i < 2; i++) {
    now += 1000;
    metrics.operation(1000);
  }
  assert.equal(metrics.snapshot().stage.remainingMs, null);
  now += 1000;
  metrics.operation(1000);
  assert.equal(metrics.snapshot().stage.remainingMs, 7000);
  assert.equal(metrics.snapshot().stage.ratePerMinute, 60);
  metrics.operation(0, { skipped: true });
  assert.equal(metrics.snapshot().stage.remainingMs, 6000);
  assert.equal(metrics.snapshot().stage.ratePerMinute, 60);
  for (let i = 0; i < 6; i++) {
    now += 2000;
    metrics.operation(2000, { failed: i === 0 });
  }
  const finished = metrics.snapshot().stage;
  assert.equal(finished.remainingMs, 0);
  assert.equal(finished.failed, 1);
  assert.equal(finished.skipped, 1);
  now += 5000;
  metrics.phase('export');
  assert.deepEqual(metrics.snapshot().stage, finished);
  metrics.phase('clustering', 2);
  assert.equal(metrics.snapshot().stage.meanMs, null);
  assert.equal(metrics.snapshot().stage.completed, 0);
});

test('recent ETA window stays bounded and memory snapshots track allocated bytes, not a CPU percentage', () => {
  let now = 0;
  const metrics = createDiagnostics(() => now);
  metrics.phase('alignment', 30);
  now = 10000;
  metrics.operation(10000);
  for (let i = 0; i < 20; i++) {
    now += 100;
    metrics.operation(100);
  }
  assert.equal(metrics.snapshot().stage.meanMs, 100);
  assert.equal(metrics.snapshot().stage.remainingMs, 900);
  metrics.memory(1024);
  metrics.memory(2048);
  metrics.memory(1024);
  assert.equal(metrics.snapshot().pythonMemoryBytes, 1024);
  assert.equal(metrics.snapshot().peakPythonMemoryBytes, 2048);
  metrics.memory(null);
  assert.equal(metrics.snapshot().pythonMemoryBytes, null);
  assert.equal(metrics.snapshot().peakPythonMemoryBytes, 2048);
});

test('network totals preserve unavailable cross-origin timings and do not call hidden bytes a cache hit', () => {
  const metrics = createDiagnostics(() => 0);
  assert.equal(metrics.snapshot().network.supported, false);
  metrics.networkSupported(true);
  metrics.resource(
    {
      transferSize: 1000,
      startTime: 0,
      responseEnd: 1000,
      decodedBodySize: 2000,
    },
    false
  );
  metrics.resource(
    {
      transferSize: 1000,
      startTime: 500,
      responseEnd: 1500,
      decodedBodySize: 2000,
    },
    true
  );
  metrics.resource(
    { transferSize: 0, startTime: 0, responseEnd: 1, decodedBodySize: 2000 },
    true
  );
  metrics.resource(
    { transferSize: 0, startTime: 0, responseEnd: 1, decodedBodySize: 2000 },
    false
  );
  metrics.resource(
    { transferSize: 0, startTime: 0, responseEnd: 1, decodedBodySize: 0 },
    false
  );
  const net = metrics.snapshot().network;
  assert.equal(net.transferBytes, 2000);
  assert.equal(net.requests, 5);
  assert.equal(net.cachedRequests, 1);
  assert.equal(net.unmeasuredRequests, 2);
  assert.equal(net.measuredRequests, 3);
  assert.equal(net.bytesPerSecond, 2000 / 1.5);
});

test('memory views refresh after growth, are always released, and degrade to unavailable', () => {
  let bytes = 100,
    released = 0;
  const probe = {
    getBuffer: () => ({
      data: { buffer: { byteLength: bytes } },
      release: () => {
        released++;
      },
    }),
  };
  assert.equal(pythonMemoryBytes(probe), 100);
  bytes = 200;
  assert.equal(pythonMemoryBytes(probe), 200);
  assert.equal(released, 2);
  assert.equal(pythonMemoryBytes(null), null);
  assert.equal(
    pythonMemoryBytes({
      getBuffer: () => {
        throw new Error('unavailable');
      },
    }),
    null
  );
  assert.equal(formatBytes(null), 'Unavailable');
  assert.equal(formatBytes(1024 ** 2), '1.0 MiB');
  assert.equal(formatDuration(0), '0 ms');
  assert.equal(formatDuration(null), 'Measuring…');
});
