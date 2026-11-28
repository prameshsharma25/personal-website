import {
  mapSequence,
  AMINO,
  type Mapping,
  type ProteinInput,
  type ReferenceProtein,
  type Residue,
} from './protein-annotations';
import { residuePreview } from './protein-hover';

export type Vec3 = [number, number, number];
export type RigidTransform = { rotation: number[][]; translation: Vec3 };
export type ComparisonPair = {
  primary: Residue;
  comparison: Residue;
  distance: number;
};
export type InspectionProtein = 'primary' | 'comparison';
export type ComparisonMode = 'structure' | 'sequence';
export type StructuralAlignmentOutput = {
  stdout: string;
  matrix: string;
  engine: {
    name: string;
    sourceCommit: string;
    sourceUrl: string;
    buildRecord: string;
    license: string;
  };
  arguments: string[];
};
export type ProteinComparisonResult = {
  mode: ComparisonMode;
  method: string;
  warnings: string[];
  sequenceAmbiguous: boolean | null;
  tmScores: { primary: number; comparison: number } | null;
  structuralAlignment:
    | (StructuralAlignmentOutput & {
        reportedRmsd: number;
        leastSquaresRmsd: number;
      })
    | null;
  primaryChain: string;
  comparisonChain: string;
  primaryCount: number;
  comparisonCount: number;
  primaryCoverage: number;
  comparisonCoverage: number;
  identity: number;
  substitutions: number;
  rmsd: number;
  maxDistance: number;
  pairs: ComparisonPair[];
  transform: RigidTransform;
};
export const COMPARISON_METHOD =
  'Sequence correspondence (one deterministic alignment when scores tie) followed by an unweighted least squares alpha carbon fit using a proper rigid rotation (Horn quaternion method). All paired residues contribute; no outlier removal or flexible fitting.';
export const STRUCTURAL_COMPARISON_METHOD =
  'MM-align structure search with no sequence identity or TM score cutoff. The displayed pairing and rigid transform come from the engine. Structural similarity does not establish homology or a unique residue correspondence. The search is heuristic and does not guarantee a global optimum.';
export const COMPARISON_LIMITATIONS =
  'Only the selected chains and first coordinate models are compared. Missing coordinates are excluded. A large displacement can reflect a domain movement, different experimental conditions, or model uncertainty; it does not establish a functional change. Annotation evidence belongs to each protein’s own reference. Structural alignment does not transfer annotations between proteins.';

export function transformPoint(p: Vec3, fit: RigidTransform): Vec3 {
  return fit.rotation.map((row, i) =>
    row.reduce((v, x, j) => v + x * p[j], fit.translation[i])
  ) as Vec3;
}

// Jacobi diagonalization of a symmetric 4x4 matrix. Selecting the largest
// algebraic eigenvalue avoids the largest-magnitude trap of power iteration.
function largestEigenvector(source: number[][]): number[] {
  const a = source.map((row) => [...row]);
  const v: number[][] = Array.from({ length: 4 }, (_, i) =>
    Array.from({ length: 4 }, (_, j) => +(i === j))
  );
  const scale = Math.max(...a.flat().map(Math.abs), 1);
  for (let sweep = 0; sweep < 100; sweep++) {
    let p = 0,
      q = 1;
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++)
        if (Math.abs(a[i][j]) > Math.abs(a[p][q])) {
          p = i;
          q = j;
        }
    if (Math.abs(a[p][q]) <= scale * 1e-14) break;
    const angle = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const pp = a[p][p],
      qq = a[q][q],
      pq = a[p][q];
    for (let k = 0; k < 4; k++)
      if (k !== p && k !== q) {
        const kp = a[k][p],
          kq = a[k][q];
        a[k][p] = a[p][k] = c * kp - s * kq;
        a[k][q] = a[q][k] = s * kp + c * kq;
      }
    a[p][p] = c * c * pp - 2 * c * s * pq + s * s * qq;
    a[q][q] = s * s * pp + 2 * c * s * pq + c * c * qq;
    a[p][q] = a[q][p] = 0;
    for (let k = 0; k < 4; k++) {
      const kp = v[k][p],
        kq = v[k][q];
      v[k][p] = c * kp - s * kq;
      v[k][q] = s * kp + c * kq;
    }
  }
  let index = 0;
  for (let i = 1; i < 4; i++) if (a[i][i] > a[index][index]) index = i;
  const q = v.map((row) => row[index]),
    norm = Math.hypot(...q);
  return q.map((x) => x / norm);
}

function noncollinear(points: Vec3[]): boolean {
  const sub = (a: Vec3, b: Vec3) => a.map((x, i) => x - b[i]) as Vec3;
  const origin = points[0];
  let far = points[1],
    length = 0;
  for (const point of points) {
    const d = Math.hypot(...sub(point, origin));
    if (d > length) {
      length = d;
      far = point;
    }
  }
  if (length < 1e-8) return false;
  const a = sub(far, origin);
  return points.some((point) => {
    const b = sub(point, origin);
    return (
      Math.hypot(
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
      ) >
      length * length * 1e-8
    );
  });
}

/** Fit moving coordinates onto fixed coordinates; never reflect or scale. */
export function fitCoordinates(fixed: Vec3[], moving: Vec3[]): RigidTransform {
  if (
    fixed.length !== moving.length ||
    fixed.length < 3 ||
    [...fixed, ...moving].some(
      (p) => p.length !== 3 || p.some((x) => !Number.isFinite(x))
    )
  )
    throw new Error(
      'Alignment needs at least three paired, finite alpha carbon coordinates.'
    );
  if (!noncollinear(fixed) || !noncollinear(moving))
    throw new Error(
      'The paired coordinates are collinear or coincident, so a unique 3D alignment cannot be determined.'
    );
  const center = (points: Vec3[]) =>
    [0, 1, 2].map(
      (i) => points.reduce((sum, p) => sum + p[i], 0) / points.length
    ) as Vec3;
  const a = center(fixed),
    b = center(moving);
  const s = Array.from({ length: 3 }, () => [0, 0, 0]);
  moving.forEach((p, k) => {
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        s[i][j] += (p[i] - b[i]) * (fixed[k][j] - a[j]);
  });
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = s;
  const [w, x, y, z] = largestEigenvector([
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ]);
  const rotation = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  const translation = rotation.map(
    (row, i) => a[i] - row.reduce((sum, v, j) => sum + v * b[j], 0)
  ) as Vec3;
  return { rotation, translation };
}

export function compareProteins(
  primary: ProteinInput,
  primaryChain: string,
  comparison: ProteinInput,
  comparisonChain: string
): ProteinComparisonResult {
  if (!primary.pdb || !comparison.pdb)
    throw new Error(
      'Upload coordinates for both proteins before comparing structures.'
    );
  const a = primary.chains.find((c) => c.id === primaryChain)?.residues;
  const b = comparison.chains.find((c) => c.id === comparisonChain)?.residues;
  if (!a?.length || !b?.length)
    throw new Error('Choose an available chain in each structure.');
  const reverse = a.length > b.length;
  const query = reverse ? b : a,
    target = reverse ? a : b;
  const mapping = mapSequence(
    query.map((r) => r.letter).join(''),
    target.map((r) => r.letter).join('')
  );
  const warnings: string[] = [];
  if (mapping.identity < 0.9)
    warnings.push(
      'Low sequence identity. This pairing is exploratory and does not establish equivalent biological positions.'
    );
  if (mapping.coverage < 0.9)
    warnings.push(
      'Limited sequence coverage. Only the paired residues contribute to the fit.'
    );
  if (mapping.ambiguous)
    warnings.push(
      'Several sequence alignments have the same score. One deterministic pairing is shown; other pairings may give a different fit.'
    );
  const pairs: ComparisonPair[] = [];
  mapping.positions.forEach((position, index) => {
    if (position == null) return;
    const first = reverse ? target[position - 1] : query[index];
    const second = reverse ? query[index] : target[position - 1];
    if (first.xyz && second.xyz)
      pairs.push({ primary: first, comparison: second, distance: 0 });
  });
  pairs.sort((a, b) => a.primary.position - b.primary.position);
  const transform = fitCoordinates(
    pairs.map((p) => p.primary.xyz),
    pairs.map((p) => p.comparison.xyz)
  );
  for (const pair of pairs) {
    const point = transformPoint(pair.comparison.xyz, transform);
    pair.distance = Math.hypot(...point.map((x, i) => x - pair.primary.xyz[i]));
  }
  return {
    mode: 'sequence',
    method: COMPARISON_METHOD,
    warnings,
    sequenceAmbiguous: mapping.ambiguous,
    tmScores: null,
    structuralAlignment: null,
    primaryChain,
    comparisonChain,
    primaryCount: a.length,
    comparisonCount: b.length,
    primaryCoverage: pairs.length / a.length,
    comparisonCoverage: pairs.length / b.length,
    identity: mapping.identity,
    substitutions: mapping.substitutions,
    rmsd: Math.sqrt(
      pairs.reduce((sum, p) => sum + p.distance * p.distance, 0) / pairs.length
    ),
    maxDistance: Math.max(...pairs.map((p) => p.distance)),
    pairs,
    transform,
  };
}

const engineLetter = (residue: Residue) =>
  'ACDEFGHIKLMNPQRSTVWY'.includes(residue.letter) ? residue.letter : 'X';

/** Canonical CA records prevent modified residue names being interpreted differently by the engine. */
export function structuralInputPdb(input: ProteinInput, chain: string): string {
  const residues = input.chains.find((c) => c.id === chain)?.residues;
  if (!residues || residues.length < 3)
    throw new Error(
      'Structural alignment needs at least three alpha carbon coordinates in each selected chain.'
    );
  return (
    comparisonPdb(input, chain)
      .split('\n')
      .filter(
        (line) => line.startsWith('ATOM') && line.slice(12, 16).trim() === 'CA'
      )
      .map((line) => {
        const residue = residues[Number(line.slice(22, 26)) - 1];
        const letter = engineLetter(residue);
        const name =
          Object.keys(AMINO).find((name) => AMINO[name] === letter) || 'UNK';
        return line.slice(0, 17) + name + line.slice(20);
      })
      .join('\n') + '\nEND\n'
  );
}

/** Read the engine's correspondence and transform together; do not refit its TM optimized overlay. */
export function structuralComparison(
  primary: ProteinInput,
  primaryChain: string,
  comparison: ProteinInput,
  comparisonChain: string,
  output: StructuralAlignmentOutput
): ProteinComparisonResult {
  const a = primary.chains.find((c) => c.id === primaryChain)?.residues;
  const b = comparison.chains.find((c) => c.id === comparisonChain)?.residues;
  if (!a?.length || !b?.length)
    throw new Error('Choose an available chain in each structure.');
  const lines = output.stdout.split(/\r?\n/);
  const marker = lines.findIndex((line) =>
    line.includes('denotes residue pairs')
  );
  const moving = lines[marker + 1]?.trim(),
    fixed = lines[marker + 3]?.trim();
  if (
    marker < 0 ||
    !moving ||
    !fixed ||
    moving.length !== fixed.length ||
    !/^[A-Z-]+$/.test(moving) ||
    !/^[A-Z-]+$/.test(fixed) ||
    moving.replace(/-/g, '') !== b.map(engineLetter).join('') ||
    fixed.replace(/-/g, '') !== a.map(engineLetter).join('')
  )
    throw new Error(
      'The structural engine returned an alignment that does not match the selected chains.'
    );
  const rows = output.matrix
    .split(/\r?\n/)
    .filter((line) => /^\s*[012]\s+/.test(line))
    .map((line) => line.trim().split(/\s+/).map(Number));
  if (
    rows.length !== 3 ||
    rows.some(
      (row, i) =>
        row.length !== 5 || row[0] !== i || row.some((n) => !Number.isFinite(n))
    )
  )
    throw new Error(
      'The structural engine did not return a valid coordinate transform.'
    );
  const rotation = rows.map((row) => row.slice(2)),
    translation = rows.map((row) => row[1]) as Vec3;
  const det =
    rotation[0][0] *
      (rotation[1][1] * rotation[2][2] - rotation[1][2] * rotation[2][1]) -
    rotation[0][1] *
      (rotation[1][0] * rotation[2][2] - rotation[1][2] * rotation[2][0]) +
    rotation[0][2] *
      (rotation[1][0] * rotation[2][1] - rotation[1][1] * rotation[2][0]);
  if (
    Math.abs(det - 1) > 1e-5 ||
    rotation.some((row, i) =>
      rotation.some(
        (other, j) =>
          Math.abs(
            row.reduce((sum, v, k) => sum + v * other[k], 0) - +(i === j)
          ) > 1e-5
      )
    )
  )
    throw new Error(
      'The structural engine returned a transform that is not a proper rigid rotation.'
    );
  const transform = { rotation, translation };
  const pairs: ComparisonPair[] = [];
  let i = 0,
    j = 0;
  for (let column = 0; column < fixed.length; column++) {
    if (fixed[column] !== '-' && moving[column] !== '-') {
      const first = a[i],
        second = b[j];
      if (
        !first.xyz ||
        !second.xyz ||
        [...first.xyz, ...second.xyz].some((n) => !Number.isFinite(n))
      )
        throw new Error(
          'The paired residues need finite alpha carbon coordinates.'
        );
      const point = transformPoint(second.xyz, transform);
      pairs.push({
        primary: first,
        comparison: second,
        distance: Math.hypot(...point.map((v, k) => v - first.xyz[k])),
      });
    }
    if (fixed[column] !== '-') i++;
    if (moving[column] !== '-') j++;
  }
  const summary = output.stdout.match(
    /Aligned length=\s*(\d+),\s*RMSD=\s*([\d.eE+-]+)/
  );
  const scores = [
    ...output.stdout.matchAll(
      /TM-score=\s*([\d.eE+-]+)\s*\(normalized by length of Structure_([12]):/g
    ),
  ];
  const tmScores = {
    primary: Number(scores.find((m) => m[2] === '2')?.[1]),
    comparison: Number(scores.find((m) => m[2] === '1')?.[1]),
  };
  const rmsd = Math.sqrt(
    pairs.reduce((sum, p) => sum + p.distance * p.distance, 0) / pairs.length
  );
  // The engine reports a least squares RMSD for its chosen pairs, but writes
  // a TM optimized transform. Keep the displayed distances and RMSD tied to
  // that transform, and record the engine's separate RMSD explicitly.
  const leastSquares = fitCoordinates(
    pairs.map((p) => p.primary.xyz),
    pairs.map((p) => p.comparison.xyz)
  );
  const leastSquaresRmsd = Math.sqrt(
    pairs.reduce(
      (sum, p) =>
        sum +
        transformPoint(p.comparison.xyz, leastSquares).reduce(
          (n, v, i) => n + (v - p.primary.xyz[i]) ** 2,
          0
        ),
      0
    ) / pairs.length
  );
  if (
    pairs.length < 3 ||
    Number(summary?.[1]) !== pairs.length ||
    !Number.isFinite(rmsd) ||
    !Number.isFinite(Number(summary?.[2])) ||
    Math.abs(Number(summary?.[2]) - leastSquaresRmsd) > 0.02 ||
    Object.values(tmScores).some((n) => !Number.isFinite(n) || n < 0 || n > 1)
  )
    throw new Error(
      'The structural alignment summary is inconsistent with its residue pairs or coordinates.'
    );
  const identical = pairs.filter(
    (p) =>
      p.primary.letter === p.comparison.letter &&
      !'XBZJ'.includes(p.primary.letter)
  ).length;
  const identity = identical / pairs.length;
  const warnings = [
    'Exploratory structural alignment. Similar geometry does not establish homology, equivalent function, or a unique residue correspondence.',
  ];
  if (identity < 0.9)
    warnings.push(
      'Sequence identity is low. Each protein requires its own reference mapping for annotations.'
    );
  return {
    mode: 'structure',
    method: STRUCTURAL_COMPARISON_METHOD,
    warnings,
    sequenceAmbiguous: null,
    tmScores,
    structuralAlignment: {
      ...output,
      reportedRmsd: Number(summary[2]),
      leastSquaresRmsd,
    },
    primaryChain,
    comparisonChain,
    primaryCount: a.length,
    comparisonCount: b.length,
    primaryCoverage: pairs.length / a.length,
    comparisonCoverage: pairs.length / b.length,
    identity,
    substitutions: pairs.length - identical,
    rmsd,
    maxDistance: Math.max(...pairs.map((p) => p.distance)),
    pairs,
    transform,
  };
}

/** Keep author labels in the report; use parser-normalized labels in the viewer. */
export function comparisonPdb(
  input: ProteinInput,
  chain: string,
  transform?: RigidTransform
): string {
  const viewerChain = input.chains.find((c) => c.id === chain)?.residues[0]
    ?.viewerChain;
  if (!input.pdb || viewerChain == null)
    throw new Error('The selected chain has no display coordinates.');
  return (
    input.pdb
      .split('\n')
      .filter((line) => line.startsWith('ATOM') && line[21] === viewerChain)
      .map((line) => {
        if (!transform) return line;
        const xyz = transformPoint(
          [
            Number(line.slice(30, 38)),
            Number(line.slice(38, 46)),
            Number(line.slice(46, 54)),
          ],
          transform
        );
        const fields = xyz.map((v) => v.toFixed(3).padStart(8));
        if (fields.some((s) => s.length > 8))
          throw new Error(
            'The aligned coordinates exceed the display format range. The numerical report is still available.'
          );
        return line.slice(0, 30) + fields.join('') + line.slice(54);
      })
      .join('\n') + '\nEND\n'
  );
}

export function comparisonReport(
  primary: ProteinInput,
  comparison: ProteinInput,
  result: ProteinComparisonResult,
  reference: ReferenceProtein | null,
  mapping: Mapping | null,
  comparisonReference: ReferenceProtein | null = null,
  comparisonMapping: Mapping | null = null
) {
  return {
    schema: 'protein-structure-comparison-1.1',
    mode: result.mode,
    method: result.method,
    warnings: result.warnings,
    sequenceAmbiguous: result.sequenceAmbiguous,
    structuralAlignment: result.structuralAlignment,
    limitations: COMPARISON_LIMITATIONS,
    coordinateUnit: 'angstrom',
    transformConvention: 'comparison coordinates into primary frame: R * x + t',
    primary: {
      name: primary.name,
      origin: primary.origin,
      chain: result.primaryChain,
    },
    comparison: {
      name: comparison.name,
      origin: comparison.origin,
      chain: result.comparisonChain,
    },
    metrics: {
      pairedResidues: result.pairs.length,
      primaryCount: result.primaryCount,
      comparisonCount: result.comparisonCount,
      primaryCoverage: result.primaryCoverage,
      comparisonCoverage: result.comparisonCoverage,
      sequenceIdentity: result.identity,
      aminoAcidMismatches: result.substitutions,
      tmScores: result.tmScores,
      rmsd: result.rmsd,
      maxDistance: result.maxDistance,
    },
    transform: result.transform,
    unmatched: {
      primary: primary.chains
        .find((c) => c.id === result.primaryChain)
        .residues.filter(
          (r) => !result.pairs.some((p) => p.primary.key === r.key)
        ),
      comparison: comparison.chains
        .find((c) => c.id === result.comparisonChain)
        .residues.filter(
          (r) => !result.pairs.some((p) => p.comparison.key === r.key)
        ),
    },
    reference: reference
      ? {
          accession: reference.accession,
          version: reference.version,
          retrievedAt: reference.retrievedAt,
          mapping,
        }
      : null,
    comparisonReference: comparisonReference
      ? {
          accession: comparisonReference.accession,
          version: comparisonReference.version,
          retrievedAt: comparisonReference.retrievedAt,
          mapping: comparisonMapping,
        }
      : null,
    pairs: result.pairs.map((pair) => ({
      ...pair,
      comparisonAnnotations: residuePreview(
        pair.comparison,
        result.comparisonChain,
        comparisonReference,
        comparisonMapping
      ).annotations,
      primaryAnnotations: residuePreview(
        pair.primary,
        result.primaryChain,
        reference,
        mapping
      ).annotations,
    })),
  };
}
export type ComparisonReport = ReturnType<typeof comparisonReport>;

export function comparisonCsv(report: ComparisonReport): string {
  // Quote every value and prevent spreadsheet formula execution from file labels.
  const cell = (value: unknown) => {
    const s = String(value ?? '');
    return (
      '"' + (/^[=+@\-\t\r\n]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"'
    );
  };
  const rows: unknown[][] = [
    [
      'primary_file',
      'primary_chain',
      'primary_residue',
      'primary_amino_acid',
      'comparison_file',
      'comparison_chain',
      'comparison_residue',
      'comparison_amino_acid',
      'ca_distance_angstrom',
      'primary_annotations',
      'alignment_method',
      'sequence_alignment_ambiguous',
      'tm_score_primary',
      'tm_score_comparison',
      'comparison_annotations',
      'primary_reference_accession',
      'comparison_reference_accession',
    ],
  ];
  for (const p of report.pairs)
    rows.push([
      report.primary.name,
      p.primary.chain,
      p.primary.number,
      p.primary.letter,
      report.comparison.name,
      p.comparison.chain,
      p.comparison.number,
      p.comparison.letter,
      p.distance.toFixed(6),
      p.primaryAnnotations
        .map((a) => `${a.source}: ${a.description}`)
        .join('; '),
      report.mode,
      report.sequenceAmbiguous,
      report.metrics.tmScores?.primary,
      report.metrics.tmScores?.comparison,
      p.comparisonAnnotations
        .map((a) => `${a.source}: ${a.description}`)
        .join('; '),
      report.reference?.accession,
      report.comparisonReference?.accession,
    ]);
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
