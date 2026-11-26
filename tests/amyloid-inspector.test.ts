import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  inspectFiles,
  readStructure,
  parseGate,
  metrics,
  reviewExport,
  sha256,
  warningItems,
  type InputFile,
} from '../lib/amyloid-inspector';
const root = new URL('../public/tools/amyloid-example/', import.meta.url);
async function files(stem = '6qjh'): Promise<InputFile[]> {
  return Promise.all(
    ['gates.json', 'manifest.json', 'pdb'].map(async (extension) => ({
      name: `${stem}.${extension}`,
      bytes: await readFile(new URL(`${stem}.${extension}`, root)),
    }))
  );
}
const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));

test('opens real package outputs and verifies the report–manifest–coordinate chain', async () => {
  const result = await inspectFiles(await files());
  assert.equal(
    result.report.positive_reference_gates.classification,
    'geometry_not_directly_assessable'
  );
  assert.equal(
    result.structure?.sha256,
    '95258f475d3410761f4bca7deff2ee104dfe947bf63aaeaad7fbcd16ad919a58'
  );
  assert.equal(result.structure?.modelIndex, 0);
  assert.ok(
    warningItems(result.report).some(
      (w) => w.code === 'direct_geometry_not_assessable'
    )
  );
  assert.equal(metrics(result.report)[0].eligible, false);
  const supported = await inspectFiles(await files('2beg'));
  assert.equal(
    supported.report.positive_reference_gates.classification,
    'amyloid_like_high_support'
  );
  assert.equal(metrics(supported.report)[0].value, 0.947781525686439);
});
test('report-only mode works without pretending to have a verified structure', async () => {
  const result = await inspectFiles((await files()).slice(0, 1));
  assert.equal(result.structure, undefined);
  assert.equal(result.manifestHash, undefined);
  assert.equal(reviewExport(result).structure_sha256, null);
});
test('rejects mismatched manifest bytes, coordinate bytes, and unbound structure', async () => {
  const input = await files();
  await assert.rejects(
    inspectFiles([
      input[0],
      {
        ...input[1],
        bytes: encode(JSON.parse(new TextDecoder().decode(input[1].bytes))),
      },
      input[2],
    ]),
    /Manifest mismatch/
  );
  const wrong = (await files('2beg'))[2];
  await assert.rejects(
    inspectFiles([input[0], input[1], wrong]),
    /Structure mismatch/
  );
  await assert.rejects(
    inspectFiles([input[0], input[2]]),
    /Include the pipeline manifest/
  );
});
test('rejects duplicate, malformed, unsupported, and oversized inputs', async () => {
  const [gate] = await files();
  await assert.rejects(inspectFiles([gate, gate]), /exactly one/);
  await assert.rejects(
    inspectFiles([{ name: 'bad.json', bytes: encode('bad') }]),
    /object/
  );
  await assert.rejects(
    inspectFiles([{ name: 'bad.json', bytes: new TextEncoder().encode('{') }]),
    /valid UTF-8 JSON/
  );
  await assert.rejects(
    inspectFiles([
      {
        name: 'future.json',
        bytes: encode({ schema_version: 'amyloid-candidate-gate-report-2.0' }),
      },
    ]),
    /schema 1.0/
  );
  await assert.rejects(
    inspectFiles([
      { name: 'large.json', bytes: new Uint8Array(25 * 1024 * 1024 + 1) },
    ]),
    /25 MB/
  );
});
test('preserves unavailable metrics and unknown warnings without inventing interpretations', async () => {
  const [gate] = await files();
  const raw = JSON.parse(new TextDecoder().decode(gate.bytes));
  raw.component_features.geometry.G_geometry = null;
  raw.positive_reference_gates.warnings.push('future_warning');
  const result = parseGate(raw);
  assert.equal(metrics(result)[0].value, null);
  const warning = warningItems(result).find((w) => w.code === 'future_warning');
  assert.match(warning!.description, /original wording/);
  raw.quality_gate.warnings = 'invalid';
  assert.throws(() => parseGate(raw), /QC warnings/);
});
test('rejects overflow numbers and unsupported interpretation scopes', async () => {
  const [gate] = await files();
  const raw = JSON.parse(new TextDecoder().decode(gate.bytes));
  raw.component_features.geometry.G_geometry = Infinity;
  assert.throws(() => parseGate(raw), /non-finite/);
  raw.component_features.geometry.G_geometry = null;
  raw.interpretation_scope = 'probability';
  assert.throws(() => parseGate(raw), /scope/);
});
test('supports matched mmCIF files and preserves a non-default model index without silently selecting another', async () => {
  const input = await files();
  const cif = new TextEncoder().encode('data_test\n');
  const manifest = JSON.parse(new TextDecoder().decode(input[1].bytes));
  manifest.source_file_sha256 = await sha256(cif);
  manifest.model_index = 2;
  const manifestBytes = encode(manifest);
  const gate = JSON.parse(new TextDecoder().decode(input[0].bytes));
  gate.source_manifest.sha256 = await sha256(manifestBytes);
  const result = await inspectFiles([
    { name: 'gates.json', bytes: encode(gate) },
    { name: 'manifest.json', bytes: manifestBytes },
    { name: 'structure.mmcif', bytes: cif },
  ]);
  assert.equal(result.structure?.format, 'cif');
  assert.equal(result.structure?.modelIndex, 2);
});
test('review export omits local source paths and prediction identifiers', async () => {
  const result = await inspectFiles(await files());
  result.report.prediction_id = '/Users/private/project';
  const exported = JSON.stringify(reviewExport(result));
  assert.equal(exported.includes('/Users/private'), false);
  assert.equal(exported.includes('component_inputs'), false);
  assert.equal(exported.includes(result.reportHash), true);
});

test('standalone coordinates preview without inventing an analysis report', async () => {
  const source = (await files('2beg'))[2];
  const structure = await readStructure(source);
  assert.equal(structure.format, 'pdb');
  assert.equal(structure.modelIndex, 0);
  assert.equal(structure.sha256, await sha256(source.bytes));
  for (const text of ['', 'not a structure', 'ATOM  invalid', 'ATOM  \u0000']) {
    await assert.rejects(
      readStructure({ name: 'bad.pdb', bytes: new TextEncoder().encode(text) })
    );
  }
  await assert.rejects(
    readStructure({
      name: 'bad.cif',
      bytes: new TextEncoder().encode('data_empty'),
    })
  );
});
