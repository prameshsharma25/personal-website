/** A reader for Amyloid Candidates outputs. Scientific scores and decisions are never recalculated here. */
export const PACKAGE_COMMIT = '1c85221ea38ffbaa1695eeb0a2962997abf94563';
export const PACKAGE_URL = 'https://github.com/DevlinaC/Amyloid_Candidates';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
type Dict = Record<string, unknown>;
export type GateReport = {
  schema_version: string;
  prediction_id: string;
  interpretation_scope: string;
  source_manifest: { sha256: string };
  quality_gate: {
    passed: boolean;
    qc_status: string;
    assessability: string;
    failures: string[];
    warnings: string[];
    measurements: Dict;
    component_failures: Record<string, string[]>;
  };
  component_features: { geometry: Dict; packing: Dict; energy: Dict };
  positive_reference_gates: {
    classification: string;
    warnings: string[];
    reference_source: string;
    geometry_eligible: boolean;
    packing_eligible: boolean;
    energy_eligible: boolean;
    geometry_state: string;
    packing_state: string;
    energy_state: string;
  };
  soluble_intrachain_core: Dict;
  packing_repeat_score: number | null;
};
export type InputFile = { name: string; bytes: Uint8Array };
export type Inspection = {
  report: GateReport;
  reportHash: string;
  manifestHash?: string;
  structure?: {
    name: string;
    text: string;
    format: 'pdb' | 'cif';
    sha256: string;
    modelIndex: number;
  };
};
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(value: unknown, label: string): Dict {
  requireValue(
    value && typeof value === 'object' && !Array.isArray(value),
    `Invalid ${label}: expected an object.`
  );
  return value as Dict;
}
function strings(value: unknown, label: string): asserts value is string[] {
  requireValue(
    Array.isArray(value) && value.every((v) => typeof v === 'string'),
    `Invalid ${label}: expected a list of text values.`
  );
}
function finiteTree(value: unknown): void {
  if (typeof value === 'number')
    requireValue(
      Number.isFinite(value),
      'The report contains a non-finite number.'
    );
  else if (Array.isArray(value)) value.forEach(finiteTree);
  else if (value && typeof value === 'object')
    Object.values(value).forEach(finiteTree);
}
export function parseGate(value: unknown): GateReport {
  const r = object(value, 'gate report');
  requireValue(
    r.schema_version === 'amyloid-candidate-gate-report-1.0',
    'Unsupported gate-report schema. Expected amyloid-candidate-gate-report-1.0.'
  );
  requireValue(
    r.interpretation_scope === 'known_amyloid_positive_reference_only',
    'Unsupported interpretation scope.'
  );
  requireValue(
    typeof r.prediction_id === 'string' && r.prediction_id.length > 0,
    'Missing prediction ID.'
  );
  const source = object(r.source_manifest, 'source manifest');
  requireValue(
    typeof source.sha256 === 'string' && /^[a-f0-9]{64}$/.test(source.sha256),
    'Missing or invalid manifest SHA-256.'
  );
  const q = object(r.quality_gate, 'quality gate');
  requireValue(
    typeof q.passed === 'boolean' &&
      typeof q.qc_status === 'string' &&
      typeof q.assessability === 'string',
    'Invalid quality-gate status.'
  );
  strings(q.failures, 'QC failures');
  strings(q.warnings, 'QC warnings');
  object(q.measurements, 'QC measurements');
  Object.values(object(q.component_failures, 'component failures')).forEach(
    (v) => strings(v, 'component failures')
  );
  const f = object(r.component_features, 'component features');
  for (const key of ['geometry', 'packing', 'energy']) object(f[key], key);
  const g = object(r.positive_reference_gates, 'reference gates');
  for (const key of [
    'classification',
    'reference_source',
    'geometry_state',
    'packing_state',
    'energy_state',
  ])
    requireValue(typeof g[key] === 'string', `Invalid ${key}.`);
  for (const key of [
    'geometry_eligible',
    'packing_eligible',
    'energy_eligible',
  ])
    requireValue(typeof g[key] === 'boolean', `Invalid ${key}.`);
  strings(g.warnings, 'reference warnings');
  object(r.soluble_intrachain_core, 'soluble core');
  finiteTree(r);
  return r as GateReport;
}
export function titleCase(code: string) {
  return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
export function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (v) =>
    v.toString(16).padStart(2, '0')
  ).join('');
}
export async function inspectFiles(files: InputFile[]): Promise<Inspection> {
  requireValue(
    files.length > 0 && files.length <= 3,
    'Select one gate report, plus an optional manifest and structure (up to three files).'
  );
  requireValue(
    files.every((f) => f.bytes.byteLength <= MAX_FILE_BYTES),
    'Each file must be 25 MB or smaller.'
  );
  requireValue(
    files.reduce((n, f) => n + f.bytes.byteLength, 0) <= 50 * 1024 * 1024,
    'The selected files must total 50 MB or less.'
  );
  const json: { file: InputFile; data: Dict }[] = [];
  const coordinates: InputFile[] = [];
  for (const file of files) {
    if (/\.(pdb|cif|mmcif)$/i.test(file.name)) coordinates.push(file);
    else if (/\.json$/i.test(file.name)) {
      let data: unknown;
      try {
        data = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)
        );
      } catch {
        throw new Error('A selected JSON file is not valid UTF-8 JSON.');
      }
      json.push({ file, data: object(data, 'JSON document') });
    } else
      throw new Error(
        'Use .gates.json, .manifest.json, and an optional .pdb, .cif, or .mmcif file.'
      );
  }
  const gates = json.filter(
    (v) => v.data.schema_version === 'amyloid-candidate-gate-report-1.0'
  );
  const manifests = json.filter(
    (v) => v.data.schema_version === 'amyloid-structural-pipeline-manifest-1.1'
  );
  requireValue(
    gates.length === 1,
    'Select exactly one Amyloid Candidates gate report (schema 1.0).'
  );
  requireValue(
    manifests.length <= 1 && coordinates.length <= 1,
    'Select only one manifest and one structure.'
  );
  requireValue(
    json.length === gates.length + manifests.length,
    'An unsupported JSON file was selected. Use the gate report and pipeline manifest only.'
  );
  const report = parseGate(gates[0].data);
  const result: Inspection = {
    report,
    reportHash: await sha256(gates[0].file.bytes),
  };
  if (manifests.length) {
    const { file, data } = manifests[0];
    result.manifestHash = await sha256(file.bytes);
    requireValue(
      result.manifestHash === report.source_manifest.sha256,
      'Manifest mismatch: this is not the manifest recorded in the gate report. No structure has been linked.'
    );
    requireValue(
      data.prediction_id === report.prediction_id,
      'The manifest and report prediction IDs differ.'
    );
    if (coordinates.length) {
      const structure = coordinates[0];
      const digest = await sha256(structure.bytes);
      requireValue(
        digest === data.source_file_sha256,
        'Structure mismatch: these coordinates do not match the manifest SHA-256. No structure has been linked.'
      );
      requireValue(
        Number.isSafeInteger(data.model_index) &&
          (data.model_index as number) >= 0,
        'The manifest has an invalid model index.'
      );
      result.structure = {
        name: structure.name.split(/[\\/]/).pop() || 'Structure',
        text: new TextDecoder().decode(structure.bytes),
        format: /\.pdb$/i.test(structure.name) ? 'pdb' : 'cif',
        sha256: digest,
        modelIndex: data.model_index as number,
      };
    }
  } else
    requireValue(
      !coordinates.length,
      'Include the pipeline manifest to verify that the structure belongs to this report.'
    );
  return result;
}
const explanations: Record<string, [string, string]> = {
  two_layer_geometry_is_extrapolative: [
    'Only two layers were observed; the repeat assessment depends on extrapolation.',
    'Inspect an assembly with more observed layers before interpreting ordinary direct-geometry support.',
  ],
  direct_geometry_not_assessable: [
    'The package could not directly assess repeat geometry.',
    'Check layer assignments, equivalent chains, and coordinate coverage.',
  ],
  packing_not_assessable: [
    'The packing component did not meet its assessability requirements.',
    'Check the packing component failures and completeness of interface coordinates.',
  ],
  interchain_energy_not_assessable: [
    'The interchain energetic component did not meet its assessability requirements.',
    'Check parameter coverage and the residues excluded from the energy calculation.',
  ],
  high_intrachain_soluble_counterevidence: [
    'Intrachain contacts, burial, or hydrogen bonding resemble a compact intrachain core relative to the positive reference set.',
    'Inspect which interactions stabilize individual chains versus the interchain repeat. This is counterevidence, not a soluble-protein diagnosis.',
  ],
  weak_interface_packing_support: [
    'The reported packing descriptor is atypical relative to the known-amyloid positive reference.',
    'Inspect the interface burial and polar satisfaction in the packing output.',
  ],
  weak_or_unfavorable_interchain_energy_support: [
    'The empirical interchain energy descriptor provides weak or unfavorable support relative to the reference bands.',
    'Inspect interchain burial, hydrogen bonding, parameter coverage, and the underlying energy output.',
  ],
  atypical_interface_repeat_consistency: [
    'Packing varies between interfaces more than expected from the positive reference band.',
    'Compare adjacent interfaces and check end effects and layer assignments.',
  ],
  packing_unavailable: [
    'A packing descriptor was not available.',
    'Review the packing output and its component eligibility. Missing evidence is not a score of zero.',
  ],
  interchain_energy_unavailable: [
    'An interchain energy descriptor was not available.',
    'Review the energy output and parameter coverage.',
  ],
  soluble_core_unavailable: [
    'The intrachain-core descriptor could not be assembled from the available components.',
    'Check whether the burial, contact, and hydrogen-bond fractions were computed.',
  ],
  canonical_common_result_required: [
    'The common structural analysis is missing or incompatible.',
    'Run the components through the same structural pipeline and regenerate the gates.',
  ],
  input_not_successfully_parsed: [
    'The structure was not successfully parsed.',
    'Review the package parse report and input format.',
  ],
  insufficient_coordinate_coverage: [
    'Coordinate coverage falls below the package requirement.',
    'Inspect missing backbone atoms and incomplete residues.',
  ],
  direct_chain_equivalence_or_layer_assignment_unavailable: [
    'Direct chain equivalence or layer assignment is unavailable.',
    'Inspect the layer map and chain equivalence before interpreting geometry.',
  ],
  energy_parameter_coverage_unavailable: [
    'Energy parameter coverage is unavailable.',
    'Inspect unsupported residue types and the energy component output.',
  ],
  insufficient_energy_parameter_coverage: [
    'Too few residues have the required energy parameters.',
    'Inspect excluded residues and compare coverage with the reported minimum.',
  ],
  packing_coordinate_coverage_unavailable: [
    'Packing coordinate coverage is unavailable.',
    'Inspect the packing component output and missing coordinates.',
  ],
  insufficient_packing_coordinate_coverage: [
    'Packing coordinate coverage is below the package requirement.',
    'Inspect missing atoms at the interface.',
  ],
  layer_topology_disagreement: [
    'The components disagree about layer topology.',
    'Review chain ordering and layer assignments across component outputs.',
  ],
  catastrophic_atom_overlaps: [
    'The structure exceeds the package’s permitted catastrophic atom overlaps.',
    'Inspect the clash pairs in the common QC output before using the structural interpretation.',
  ],
};
export function warningItems(report: GateReport) {
  const grouped = new Map<string, Set<string>>();
  const add = (values: string[], source: string) =>
    values.forEach((code) =>
      grouped.set(code, new Set([...(grouped.get(code) || []), source]))
    );
  add(report.quality_gate.failures, 'Quality Gate');
  add(report.quality_gate.warnings, 'Quality Warning');
  Object.entries(report.quality_gate.component_failures).forEach(
    ([key, values]) => add(values, `${titleCase(key)} Eligibility`)
  );
  add(report.positive_reference_gates.warnings, 'Reference Interpretation');
  return Array.from(grouped, ([code, sources]) => ({
    code,
    sources: Array.from(sources),
    title: code.includes('_') ? titleCase(code) : code,
    description:
      explanations[code]?.[0] ||
      'The package reported this finding. Its original wording is preserved above.',
    next:
      explanations[code]?.[1] ||
      'Review the corresponding component output and the package documentation for context.',
  }));
}
export function metrics(report: GateReport) {
  const f = report.component_features,
    g = report.positive_reference_gates;
  return [
    {
      label: 'Repeat Geometry',
      symbol: 'G_geometry',
      value: numberOrNull(f.geometry.G_geometry),
      eligible: g.geometry_eligible,
      state: g.geometry_state,
      detail:
        'Repeat geometry descriptor. A value is not a probability of forming amyloid.',
    },
    {
      label: 'Interface Packing',
      symbol: 'D_sasa',
      value: numberOrNull(f.packing.D_sasa),
      eligible: g.packing_eligible,
      state: g.packing_state,
      detail:
        'SASA-based interface descriptor; it is not a complete steric-zipper assessment.',
    },
    {
      label: 'Interchain Energy',
      symbol: 'dG_interchain_per_residue',
      value: numberOrNull(f.energy.dG_interchain_per_residue),
      eligible: g.energy_eligible,
      state: g.energy_state,
      detail:
        'Empirical solvation-energy estimate in kcal/mol per residue; not a full thermodynamic free energy.',
    },
  ];
}
export function reviewExport(result: Inspection) {
  return {
    schema_version: 'amyloid-inspector-review-1.0',
    interpretation_scope: result.report.interpretation_scope,
    report_sha256: result.reportHash,
    manifest_sha256: result.manifestHash || null,
    structure_sha256: result.structure?.sha256 || null,
    model_index: result.structure?.modelIndex ?? null,
    classification: result.report.positive_reference_gates.classification,
    qc_status: result.report.quality_gate.qc_status,
    reference_source: result.report.positive_reference_gates.reference_source,
    metrics: metrics(result.report),
    warnings: warningItems(result.report),
    notice:
      'Package-reported descriptors relative to known amyloid positives, not a calibrated probability or experimental confirmation. SHA-256 matching establishes file consistency, not scientific validity.',
  };
}
