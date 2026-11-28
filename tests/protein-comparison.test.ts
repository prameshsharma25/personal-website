import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  compareProteins,
  comparisonCsv,
  comparisonPdb,
  comparisonReport,
  fitCoordinates,
  transformPoint,
  type Vec3,
} from '../lib/protein-comparison';
import { parseProteinStructure } from '../lib/protein-input';
const a = parseProteinStructure(
  fs.readFileSync('public/structures/rfah/2OUG-CTD.pdb', 'utf8'),
  '2OUG.pdb'
);
const b = parseProteinStructure(
  fs.readFileSync('public/structures/rfah/2LCL-CTD.pdb', 'utf8'),
  '2LCL.pdb'
);
const points: Vec3[] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 2, 0],
  [0, 0, 3],
  [1, 3, 4],
];
const close = (actual: number, expected: number, tol = 1e-8) =>
  assert.ok(Math.abs(actual - expected) < tol, `${actual} != ${expected}`);

test('proper rigid fit removes translation and arbitrary rotation without scaling', () => {
  const axis = [1, 2, 3].map((x) => x / Math.sqrt(14)),
    angle = 1.21,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const rotated = points.map(
    (p) =>
      axis.map(
        (x, i) =>
          p[i] * c +
          x * axis.reduce((n, v, j) => n + v * p[j], 0) * (1 - c) +
          (axis[(i + 1) % 3] * p[(i + 2) % 3] -
            axis[(i + 2) % 3] * p[(i + 1) % 3]) *
            s +
          [15, -7, 9][i]
      ) as Vec3
  );
  const fit = fitCoordinates(points, rotated);
  rotated.forEach((p, i) =>
    transformPoint(p, fit).forEach((x, j) => close(x, points[i][j]))
  );
  const same = fitCoordinates(points, points);
  points.forEach((p) =>
    transformPoint(p, same).forEach((x, j) => close(x, p[j]))
  );
  const scaled = fitCoordinates(
    points,
    points.map((p) => p.map((x) => x * 2) as Vec3)
  );
  assert.ok(
    points.some(
      (p) =>
        Math.hypot(
          ...transformPoint(p.map((x) => x * 2) as Vec3, scaled).map(
            (x, j) => x - p[j]
          )
        ) > 0.1
    )
  );
});
test('a reflection cannot be fitted away and planar data is supported', () => {
  const reflected = points.map(([x, y, z]) => [-x, y, z] as Vec3),
    fit = fitCoordinates(points, reflected),
    r = fit.rotation;
  close(
    r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) -
      r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0]) +
      r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]),
    1
  );
  assert.ok(
    reflected.some(
      (p, i) =>
        Math.hypot(...transformPoint(p, fit).map((v, j) => v - points[i][j])) >
        0.1
    )
  );
  const planar: Vec3[] = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ];
  fitCoordinates(planar, planar);
  assert.throws(
    () =>
      fitCoordinates(
        [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
        [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ]
      ),
    /collinear/
  );
  assert.throws(
    () => fitCoordinates(points, [[NaN, 0, 0], ...points.slice(1)]),
    /finite/
  );
});
test('RfaH states pair by sequence, retain author labels and report unequal coverage', () => {
  const result = compareProteins(a, 'A', b, 'A');
  assert.equal(result.pairs.length, 42);
  close(result.primaryCoverage, 1);
  close(result.comparisonCoverage, 42 / 48);
  assert.equal(result.identity, 1);
  assert.equal(result.substitutions, 0);
  assert.equal(result.pairs[0].primary.number, '115');
  assert.ok(result.rmsd > 1 && result.rmsd < 30);
  const backwards = compareProteins(b, 'A', a, 'A');
  close(result.rmsd, backwards.rmsd);
  close(backwards.primaryCoverage, 42 / 48);
  const report = comparisonReport(a, b, result, null, null);
  assert.equal(report.unmatched.comparison.length, 6);
  assert.equal(report.pairs.length, 42);
  const csv = comparisonCsv(report);
  assert.equal(csv.split('\r\n').length, 43);
  const shown = parseProteinStructure(
    comparisonPdb(b, 'A', result.transform),
    'aligned.pdb'
  );
  shown.chains[0].residues.forEach((r, i) =>
    r.xyz.forEach((x, j) =>
      close(
        x,
        transformPoint(b.chains[0].residues[i].xyz, result.transform)[j],
        0.001
      )
    )
  );
});
test('identical structures have zero distance and altered coordinates are measured', () => {
  const copy = structuredClone(a);
  copy.chains[0].residues.forEach((r) => {
    r.number = `${Number(r.number) + 500}A`;
  });
  const result = compareProteins(a, 'A', copy, 'A');
  close(result.rmsd, 0);
  assert.equal(result.pairs[0].comparison.number, '615A');
  copy.chains[0].residues[20].xyz[0] += 12;
  const moved = compareProteins(a, 'A', copy, 'A');
  assert.ok(moved.rmsd > 1);
  assert.equal(
    moved.pairs.reduce((max, p) => (p.distance > max.distance ? p : max))
      .primary.position,
    21
  );
});
test('weak and ambiguous sequence fits are displayed, while missing structures are rejected', () => {
  const copy = structuredClone(b);
  copy.chains[0].residues.forEach((r) => {
    r.letter = 'A';
  });
  const weak = compareProteins(a, 'A', copy, 'A');
  assert.ok(weak.pairs.length >= 3);
  assert.ok(weak.identity < 0.9);
  assert.ok(
    weak.warnings.some((note) => note.includes('Low sequence identity'))
  );
  const repeat = structuredClone(a);
  repeat.chains[0].residues.push(
    ...repeat.chains[0].residues.map((r) => ({ ...r }))
  );
  const tied = compareProteins(a, 'A', repeat, 'A');
  assert.equal(tied.sequenceAmbiguous, true);
  assert.equal(tied.pairs.length, 42);
  assert.ok(tied.warnings.some((note) => note.includes('same score')));
  assert.throws(() => compareProteins(a, 'wrong', b, 'A'), /chain/);
  assert.throws(
    () => compareProteins({ ...a, pdb: undefined }, 'A', b, 'A'),
    /coordinates/
  );
});
test('comparison report retains annotation source evidence and CSV escapes file names', () => {
  const input = parseProteinStructure(
    fs.readFileSync('public/tools/protein-annotations/1LYZ.pdb', 'utf8'),
    '=HYPERLINK("test").pdb'
  );
  const reference = JSON.parse(
    fs.readFileSync('public/tools/protein-annotations/P00698.json', 'utf8')
  );
  const result = compareProteins(input, 'A', input, 'A');
  const mapping = {
    positions: input.chains[0].residues.map((_, i) => i + 19),
    identity: 1,
    coverage: 1,
    usable: true,
    exact: true,
    ambiguous: false,
    substitutions: 0,
    method: 'fixture',
  };
  const report = comparisonReport(input, input, result, reference, mapping);
  assert.ok(
    report.pairs.some((p) =>
      p.primaryAnnotations.some((a) => a.category === 'Active site')
    )
  );
  assert.match(comparisonCsv(report), /"'=HYPERLINK\(""test""\).pdb"/);
  assert.ok(
    comparisonReport(input, input, result, reference, {
      ...mapping,
      usable: false,
    }).pairs.every((p) => p.primaryAnnotations.length === 0)
  );
});

test('symmetric reflected tetrahedron has the analytic proper rotation RMSD of 2 angstroms', () => {
  const fixed: Vec3[] = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ];
  const moving = fixed.map(([x, y, z]) => [-x, y, z] as Vec3),
    fit = fitCoordinates(fixed, moving);
  const squared = moving.reduce(
    (sum, p, i) =>
      sum +
      transformPoint(p, fit).reduce((n, x, j) => n + (x - fixed[i][j]) ** 2, 0),
    0
  );
  close(Math.sqrt(squared / fixed.length), 2);
});

test('comparison exports keep independently mapped evidence for both proteins with identical residue keys', () => {
  const input = parseProteinStructure(
    fs.readFileSync('public/tools/protein-annotations/1LYZ.pdb', 'utf8'),
    'same-keys.pdb'
  );
  const reference = JSON.parse(
    fs.readFileSync('public/tools/protein-annotations/P00698.json', 'utf8')
  );
  const otherReference = {
    ...reference,
    accession: 'TEST_SECOND_REFERENCE',
    annotations: reference.annotations.map((a) => ({
      ...a,
      id: `second-${a.id}`,
      description: `Second reference: ${a.description}`,
    })),
  };
  const result = compareProteins(input, 'A', input, 'A');
  const mapping = {
    positions: input.chains[0].residues.map((_, i) => i + 19),
    identity: 1,
    coverage: 1,
    usable: true,
    exact: false,
    ambiguous: false,
    substitutions: 0,
    method: 'fixture',
  };
  const report = comparisonReport(
    input,
    input,
    result,
    reference,
    mapping,
    otherReference,
    mapping
  );
  assert.equal(report.reference.accession, 'P00698');
  assert.equal(report.comparisonReference.accession, 'TEST_SECOND_REFERENCE');
  assert.ok(report.pairs.some((p) => p.comparisonAnnotations.length));
  for (const pair of report.pairs) {
    assert.ok(
      pair.primaryAnnotations.every((a) => !a.id.startsWith('second-'))
    );
    assert.ok(
      pair.comparisonAnnotations.every((a) => a.id.startsWith('second-'))
    );
  }
  assert.match(comparisonCsv(report), /comparison_annotations/);
  assert.match(comparisonCsv(report), /Second reference:/);
  const withheld = comparisonReport(
    input,
    input,
    result,
    reference,
    mapping,
    otherReference,
    { ...mapping, usable: false }
  );
  assert.ok(withheld.pairs.every((p) => !p.comparisonAnnotations.length));
  assert.ok(withheld.pairs.some((p) => p.primaryAnnotations.length));
  const secondaryOnly = comparisonReport(
    input,
    input,
    result,
    null,
    null,
    otherReference,
    mapping
  );
  assert.ok(secondaryOnly.pairs.every((p) => !p.primaryAnnotations.length));
  assert.ok(secondaryOnly.pairs.some((p) => p.comparisonAnnotations.length));
});
