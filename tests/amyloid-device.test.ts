import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateDeviceFiles, DEVICE_LIMITS } from '../lib/amyloid-device';
import { PACKAGE_COMMIT } from '../lib/amyloid-inspector';
import { scienceDigest } from '../public/tools/amyloid-device/v1/checkpoints.mjs';

test('device input limits reject unsupported, empty, oversized, and excessive batches', () => {
  const file = { name: 'assembly.PDB', size: 1000 };
  assert.doesNotThrow(() =>
    validateDeviceFiles([file, { ...file, name: 'assembly.mmcif' }])
  );
  assert.doesNotThrow(() =>
    validateDeviceFiles(
      Array.from({ length: 125 }, (_, i) => ({
        ...file,
        name: `model-${i}.pdb`,
      }))
    )
  );
  assert.doesNotThrow(() =>
    validateDeviceFiles(
      Array.from({ length: 10 }, (_, i) => ({
        name: `model-${i}.pdb`,
        size: 10 * 1024 ** 2,
      }))
    )
  );
  for (const files of [
    [],
    [file, file],
    Array.from({ length: 126 }, (_, i) => ({
      ...file,
      name: `model-${i}.pdb`,
    })),
    [{ ...file, name: 'report.json' }],
    [{ ...file, size: 0 }],
    [{ ...file, size: DEVICE_LIMITS.fileBytes + 1 }],
    Array.from({ length: 11 }, (_, i) => ({
      name: `model-${i}.pdb`,
      size: 10 * 1024 ** 2,
    })),
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

test('candidate budget release preserves scientific identity and prior saved runs', async () => {
  const engine = JSON.parse(
    readFileSync(
      new URL('../public/tools/amyloid-device/v1/engine.json', import.meta.url),
      'utf8'
    )
  );
  const science = await scienceDigest(engine);
  assert.equal(
    science,
    '70a4e9131b557a941ef1b54faae2502be8e43dcdf470b76d13345ce5974dfe5c'
  );
  assert.ok(
    engine.checkpoint_compatible_engines.some(
      (entry: { engine: string; science: string }) =>
        entry.engine ===
          'acca2062d11b6d058bf29861264436255671ab7e369757137b03a5825cb13104' &&
        entry.science === science
    )
  );
});
