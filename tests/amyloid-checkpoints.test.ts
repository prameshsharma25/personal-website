import test from 'node:test';
import assert from 'node:assert/strict';
import { checkpointFailure } from '../public/tools/amyloid-device/v1/checkpoints.mjs';

test('empty browser errors retain their name, stage, and actionable detail', () => {
  for (const name of ['QuotaExceededError', 'UnknownError', 'AbortError']) {
    const failure = checkpointFailure(new DOMException('', name), 'alignments');
    assert.equal(failure.name, name);
    assert.equal(failure.stage, 'alignments');
    assert.ok(failure.message.length > 20);
  }
  assert.match(
    checkpointFailure(new DOMException('', 'QuotaExceededError')).message,
    /storage/
  );
});

test('provided browser messages are preserved and missing errors get a fallback', () => {
  assert.deepEqual(
    checkpointFailure(
      new DOMException('Disk full', 'UnknownError'),
      'completion'
    ),
    {
      name: 'UnknownError',
      stage: 'completion',
      message: 'Disk full',
    }
  );
  assert.equal(checkpointFailure(null).name, 'Error');
  assert.match(checkpointFailure(null).message, /did not provide/);
});
