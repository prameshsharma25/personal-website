import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateDeviceFiles, DEVICE_LIMITS } from '../lib/amyloid-device';
import { PACKAGE_COMMIT } from '../lib/amyloid-inspector';

test('device input limits reject unsupported, empty, oversized, and excessive batches', () => {
  const file = { name: 'assembly.PDB', size: 1000 };
  assert.doesNotThrow(() =>
    validateDeviceFiles([file, { ...file, name: 'assembly.mmcif' }])
  );
  for (const files of [
    [],
    Array(6).fill(file),
    [{ ...file, name: 'report.json' }],
    [{ ...file, size: 0 }],
    [{ ...file, size: DEVICE_LIMITS.fileBytes + 1 }],
    Array(3).fill({ ...file, size: DEVICE_LIMITS.fileBytes }),
  ]) {
    assert.throws(() => validateDeviceFiles(files));
  }
});

test('browser scientific bundle and adapter match their recorded hashes and limits', () => {
  const base = new URL('../public/tools/amyloid-device/v1/', import.meta.url);
  const engine = JSON.parse(readFileSync(new URL('engine.json', base), 'utf8'));
  assert.equal(engine.package_commit, PACKAGE_COMMIT);
  assert.equal(engine.limits.max_files, DEVICE_LIMITS.files);
  assert.equal(engine.limits.max_file_bytes, DEVICE_LIMITS.fileBytes);
  assert.equal(engine.limits.max_total_bytes, DEVICE_LIMITS.totalBytes);
  for (const [name, digest] of Object.entries(engine.files)) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL(name, base)))
        .digest('hex'),
      digest
    );
  }
});
