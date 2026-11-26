import assert from 'node:assert/strict';
import test from 'node:test';
import { AnalysisClock } from '../lib/analysis-clock';

test('elapsed time accumulates active intervals without counting pauses', () => {
  let now = 0;
  const clock = new AnalysisClock(() => now);
  clock.start();
  now = 1537;
  assert.equal(clock.stop(), 1537);
  now = 100000;
  assert.equal(clock.elapsedMs, 1537);
  assert.equal(clock.stop(), 1537);
  clock.start();
  now += 783;
  clock.start(); // A duplicate start cannot reset the active interval.
  assert.equal(clock.stop(), 2320);
  clock.restore(2320);
  now += 50000;
  clock.start();
  now += 940;
  assert.equal(clock.stop(), 3260);
  clock.restore();
  assert.equal(clock.elapsedMs, 0);
  assert.equal(clock.running, false);
});

test('saved totals are finite and nonnegative', () => {
  const clock = new AnalysisClock(() => 0);
  for (const value of [undefined, NaN, Infinity, -100]) {
    clock.restore(value);
    assert.equal(clock.elapsedMs, 0);
  }
});
