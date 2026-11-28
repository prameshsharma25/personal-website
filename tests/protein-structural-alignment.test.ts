import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runStructuralAlignment } from '../public/tools/protein-annotations/structural-alignment.mjs';
import { parseProteinStructure } from '../lib/protein-input';
import {
  structuralComparison,
  structuralInputPdb,
  comparisonReport,
  compareProteins,
  transformPoint,
  type StructuralAlignmentOutput,
} from '../lib/protein-comparison';
import { mapSequence } from '../lib/protein-annotations';
const read = (file: string) =>
  parseProteinStructure(fs.readFileSync(file, 'utf8'), file);
const primary = read('tests/fixtures/protein-comparison/2OUG-chain-A.pdb');
const comparison = read('tests/fixtures/protein-comparison/5JYT-chain-A.pdb');
const binary = fs.readFileSync(
  'public/tools/amyloid-device/v1/mmalign/mmalign.wasm'
);
const outputPromise: Promise<StructuralAlignmentOutput> =
  runStructuralAlignment(
    structuralInputPdb(comparison, 'A'),
    structuralInputPdb(primary, 'A'),
    binary
  );

test('actual pinned WebAssembly aligns 2OUG and 5JYT despite low identity and tied sequence mapping', async () => {
  const output = await outputPromise;
  const result = structuralComparison(primary, 'A', comparison, 'A', output);
  assert.equal(result.mode, 'structure');
  assert.equal(result.pairs.length, 68);
  assert.equal(result.primaryCount, 141);
  assert.equal(result.comparisonCount, 106);
  assert.ok(Math.abs(result.rmsd - 4.7236475) < 1e-5);
  assert.ok(
    Math.abs(result.structuralAlignment.leastSquaresRmsd - 4.6306546) < 1e-5
  );
  assert.equal(result.structuralAlignment.reportedRmsd, 4.63);
  assert.deepEqual(result.tmScores, { primary: 0.29981, comparison: 0.36549 });
  assert.ok(result.identity < 0.1);
  assert.ok(result.warnings.length);
  assert.equal(result.sequenceAmbiguous, null); // No claim that the structural search proves a unique match.
  assert.equal(
    mapSequence(
      comparison.chains[0].residues.map((r) => r.letter).join(''),
      primary.chains[0].residues.map((r) => r.letter).join('')
    ).usable,
    false
  );
  const sequence = compareProteins(primary, 'A', comparison, 'A');
  assert.equal(sequence.sequenceAmbiguous, true);
  assert.ok(sequence.pairs.length >= 3);
  const report = comparisonReport(primary, comparison, result, null, null);
  assert.equal(report.schema, 'protein-structure-comparison-1.1');
  assert.equal(report.structuralAlignment.stdout, output.stdout);
  assert.equal(
    report.structuralAlignment.engine.sourceCommit,
    '23f14ffcf8647f2dc1c0e01043db3a7f3a661c28'
  );
  assert.equal(report.metrics.aminoAcidMismatches, 64);
  assert.equal(report.unmatched.primary.length, 73);
  assert.equal(report.unmatched.comparison.length, 38);
  for (const pair of result.pairs) {
    const moved = transformPoint(pair.comparison.xyz, result.transform);
    assert.ok(
      Math.abs(
        pair.distance -
          Math.hypot(...moved.map((x, i) => x - pair.primary.xyz[i]))
      ) < 1e-10
    );
  }
});

test('identical structures retain complete correspondence, unit TM scores, and zero distances', async () => {
  const output = await runStructuralAlignment(
    structuralInputPdb(primary, 'A'),
    structuralInputPdb(primary, 'A'),
    binary
  );
  const result = structuralComparison(primary, 'A', primary, 'A', output);
  assert.equal(result.pairs.length, 141);
  assert.ok(result.rmsd < 1e-6);
  assert.deepEqual(result.tmScores, { primary: 1, comparison: 1 });
  assert.equal(result.identity, 1);
});

test('modified and unknown residue inputs keep an explicit normalized sequence without losing positions', () => {
  const input = structuredClone(primary);
  input.chains[0].residues[0].letter = 'U';
  input.chains[0].residues[1].letter = 'M';
  const parsed = parseProteinStructure(
    structuralInputPdb(input, 'A'),
    'normalized.pdb'
  );
  assert.equal(parsed.chains[0].residues.length, 141);
  assert.equal(parsed.chains[0].residues[0].letter, 'X');
  assert.equal(parsed.chains[0].residues[1].letter, 'M');
});

test('output parser rejects mismatched inputs, corrupt summaries, and reflected transforms', async () => {
  const output = await outputPromise;
  assert.throws(
    () => structuralComparison(primary, 'A', primary, 'A', output),
    /does not match/
  );
  assert.throws(
    () =>
      structuralComparison(primary, 'A', comparison, 'A', {
        ...output,
        stdout: output.stdout.replace(
          'Aligned length= 68',
          'Aligned length= 69'
        ),
      }),
    /inconsistent/
  );
  assert.throws(
    () =>
      structuralComparison(primary, 'A', comparison, 'A', {
        ...output,
        stdout: output.stdout.replace('RMSD=   4.63', 'RMSD= 999.99'),
      }),
    /inconsistent/
  );
  assert.throws(
    () =>
      structuralComparison(primary, 'A', comparison, 'A', {
        ...output,
        matrix: '0 0 -1 0 0\n1 0 0 1 0\n2 0 0 0 1',
      }),
    /proper rigid rotation/
  );
  assert.throws(
    () =>
      structuralComparison(primary, 'A', comparison, 'A', {
        ...output,
        matrix: '',
      }),
    /coordinate transform/
  );
});
