import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  mapSequence,
  parseSequence,
  normalizeUniProt,
  normalizeInterPro,
  annotationPositions,
  regionAnnotations,
  neighbors,
  type ReferenceProtein,
} from '../lib/protein-annotations';
import { parseProteinStructure, cifTokens } from '../lib/protein-input';
import { createAnnotationService } from '../lib/protein-annotations-server';
import { residuePreview } from '../lib/protein-hover';
const reference: ReferenceProtein = JSON.parse(
  fs.readFileSync('public/tools/protein-annotations/P00698.json', 'utf8')
);
const example = parseProteinStructure(
  fs.readFileSync('public/tools/protein-annotations/1LYZ.pdb', 'utf8'),
  '1LYZ.pdb'
);

test('hover previews use mapped sequence positions and prioritize local features with their sources', () => {
  const residues = example.chains[0].residues;
  const mapping = mapSequence(
    residues.map((r) => r.letter).join(''),
    reference.sequence
  );
  const originalOrder = reference.annotations.map((a) => a.id);
  const preview = residuePreview(residues[34], 'A', reference, mapping);
  assert.equal(residues[34].number, '35');
  assert.equal(preview.position, 53);
  assert.equal(preview.referenceLetter, 'E');
  assert.equal(preview.annotations[0].category, 'Active site');
  assert.equal(preview.annotations[0].source, 'UniProt');
  assert.equal(preview.message, null);
  assert.deepEqual(
    reference.annotations.map((a) => a.id),
    originalOrder
  );
  // Author insertion codes never become array indices.
  assert.equal(
    residuePreview({ ...residues[34], number: '35A' }, 'A', reference, mapping)
      .position,
    53
  );
  const substitution = residuePreview(
    { ...residues[34], letter: 'A' },
    'A',
    reference,
    mapping
  );
  assert.equal(substitution.referenceLetter, 'E');
});

test('hover previews never transfer features across an unselected chain or an unusable mapping', () => {
  const residues = example.chains[0].residues;
  const mapping = mapSequence(
    residues.map((r) => r.letter).join(''),
    reference.sequence
  );
  for (const result of [
    residuePreview(residues[34], 'A', null, null),
    residuePreview({ ...residues[34], chain: 'B' }, 'A', reference, mapping),
    residuePreview(residues[34], 'A', reference, {
      ...mapping,
      usable: false,
      ambiguous: true,
    }),
    residuePreview(residues[34], 'A', reference, {
      ...mapping,
      positions: mapping.positions.map(() => null),
    }),
  ]) {
    assert.equal(result.position, null);
    assert.deepEqual(result.annotations, []);
    assert.ok(result.message);
  }
  const noFeatures = residuePreview(
    residues[34],
    'A',
    { ...reference, annotations: [] },
    mapping
  );
  assert.equal(noFeatures.position, 53);
  assert.match(noFeatures.message, /No annotation found/);
});

test('real lysozyme maps mature protein numbering to the reference catalytic sites', () => {
  const residues = example.chains[0].residues;
  assert.equal(residues.length, 129);
  const mapping = mapSequence(
    residues.map((r) => r.letter).join(''),
    reference.sequence
  );
  assert.equal(mapping.usable, true);
  assert.equal(mapping.positions[0], 19);
  assert.deepEqual(
    reference.annotations
      .filter((a) => a.category === 'Active site')
      .flatMap((a) =>
        annotationPositions(a, residues, mapping).map(
          (r) => `${r.name}${r.number}`
        )
      ),
    ['GLU35', 'ASP52']
  );
  const selected = new Set([residues[34].key]);
  assert.equal(
    regionAnnotations(
      reference.annotations,
      residues,
      mapping,
      selected
    ).filter((a) => a.category === 'Active site').length,
    1
  );
});
test('mapping rejects weak and ambiguous references, preserves insertions/deletions and substitutions', () => {
  assert.equal(mapSequence('ACDEFG', 'WWACDEFGYYACDEFG').usable, false);
  assert.equal(mapSequence('ACDEFG', 'WWACDEFGYYACDEFG').ambiguous, true);
  assert.equal(mapSequence('WWWWWW', 'ACDEFGHIKLMNPQRST').usable, false);
  const sequence = reference.sequence;
  const changed = sequence.slice(0, 60) + 'A' + sequence.slice(61);
  const mismatch = mapSequence(changed, sequence);
  assert.equal(mismatch.usable, true);
  assert.equal(mismatch.substitutions, 1);
  assert.equal(mismatch.positions[60], 61);
  const missing = mapSequence(
    sequence.slice(0, 55) + sequence.slice(56),
    sequence
  );
  assert.equal(missing.usable, true);
  assert.equal(missing.positions[55], 57);
  assert.throws(() => mapSequence('A'.repeat(2001), sequence), /2,000/);
});
test('FASTA validation retains accession but rejects multiple sequences and nonprotein input', () => {
  assert.equal(
    parseSequence('>sp|P00698|LYSC_CHICK\nACD EFG\nHIK*').suggestedAccession,
    'P00698'
  );
  assert.throws(() => parseSequence('>one\nACDEF\n>two\nGHIKL'), /single/);
  assert.throws(() => parseSequence('ACD123'), /amino acid/);
  assert.throws(() => parseSequence('A'.repeat(2001)), /2,000/);
});
const cif = `data_test
_entry.note
;multiline description
_this_is_not_a_column
;
loop_
_atom_site.group_PDB
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.auth_comp_id
_atom_site.auth_atom_id
_atom_site.type_symbol
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.label_alt_id
_atom_site.pdbx_PDB_model_num
ATOM 'Long Chain' 10 ? GLU CA C 0 0 0 . 1
ATOM 'Long Chain' 10 A ASP CA C 4 0 0 . 1
ATOM 'Long Chain' 11 ? CYS CA C 10 0 0 A 1
ATOM 'Long Chain' 11 ? CYS CA C 99 0 0 B 1
ATOM B 10 ? ALA CA C 15 0 0 . 1
HETATM B 12 ? HOH O O 20 0 0 . 1
ATOM 'Long Chain' 10 ? GLU CA C 30 0 0 . 2
#
`;
test('CIF preserves author chains and insertion codes, excludes alternate conformations, water and later models', () => {
  const input = parseProteinStructure(cif, 'test.cif');
  assert.deepEqual(
    input.chains.map((c) => c.id),
    ['Long Chain', 'B']
  );
  assert.deepEqual(
    input.chains[0].residues.map((r) => r.number),
    ['10', '10A', '11']
  );
  assert.equal(input.chains[0].residues[2].xyz[0], 10);
  assert.notEqual(
    input.chains[0].residues[0].key,
    input.chains[0].residues[1].key
  );
  const reparsed = parseProteinStructure(input.pdb, 'normalized.pdb');
  assert.deepEqual(
    reparsed.chains[0].residues.map((r) => r.letter),
    ['E', 'D', 'C']
  );
  assert.deepEqual(
    reparsed.chains[0].residues.map((r) => r.number),
    ['1', '2', '3']
  );
  assert.deepEqual(
    neighbors(
      input.chains[0].residues,
      new Set([input.chains[0].residues[0].key]),
      5
    ),
    input.chains[0].residues.slice(0, 2).map((r) => r.key)
  );
  assert.throws(
    () =>
      parseProteinStructure(cif.replace('C 4 0 0', 'C invalid 0 0'), 'bad.cif'),
    /invalid atom/
  );
  assert.throws(() => cifTokens("data_a\n'_unfinished"), /unfinished/);
});
test('PDB insertion codes and first model stay distinct', () => {
  const normalized = parseProteinStructure(cif, 'test.cif')
    .pdb.split('\n')
    .filter((l) => l.startsWith('ATOM'));
  const rows = normalized
    .slice(0, 2)
    .map((l, i) => l.slice(0, 22) + '  10' + (i ? 'A' : ' ') + l.slice(27));
  const input = parseProteinStructure(
    rows.join('\n') + '\nENDMDL\n' + normalized[2],
    'custom.pdb'
  );
  assert.deepEqual(
    input.chains[0].residues.map((r) => r.number),
    ['10', '10A']
  );
});
test('bond features cover endpoints only; unknown positions and uncertain boundaries remain honest', () => {
  const source = {
    primaryAccession: 'P00698',
    sequence: { value: 'ACDEFGHIKLMN' },
    features: [
      {
        type: 'Disulfide bond',
        location: {
          start: { value: 2, modifier: 'EXACT' },
          end: { value: 10, modifier: 'EXACT' },
        },
      },
      {
        type: 'Region',
        location: {
          start: { value: 4, modifier: 'UNSURE' },
          end: { value: 8, modifier: 'EXACT' },
        },
      },
      {
        type: 'Binding site',
        location: {
          start: { modifier: 'UNKNOWN' },
          end: { modifier: 'UNKNOWN' },
        },
      },
    ],
  };
  const ref = normalizeUniProt(source);
  assert.equal(ref.annotations.length, 2);
  assert.deepEqual(ref.annotations[0].spans, [
    [2, 2],
    [10, 10],
  ]);
  assert.match(ref.annotations[1].uncertainty, /uncertain/);
  const residues = parseSequence(source.sequence.value).chains[0].residues;
  assert.equal(
    regionAnnotations(
      ref.annotations,
      residues,
      mapSequence(source.sequence.value, source.sequence.value),
      new Set([residues[5].key])
    ).some((a) => a.category === 'Disulfide bond'),
    false
  );
});
test('InterPro keeps discontinuous fragments and filters other proteins', () => {
  const data = {
    results: [
      {
        metadata: { accession: 'IPR000001', name: 'Example', type: 'domain' },
        proteins: [
          {
            accession: 'p00698',
            entry_protein_locations: [
              {
                fragments: [
                  { start: 1, end: 5 },
                  { start: 10, end: 12 },
                ],
              },
            ],
          },
          {
            accession: 'p00001',
            entry_protein_locations: [
              { fragments: [{ start: 100, end: 120 }] },
            ],
          },
        ],
      },
    ],
  };
  const annotations = normalizeInterPro(data, 'P00698');
  assert.deepEqual(annotations[0].spans, [
    [1, 5],
    [10, 12],
  ]);
  const residues = parseSequence('ACDEFGHIKLMN').chains[0].residues;
  assert.equal(
    regionAnnotations(
      annotations,
      residues,
      mapSequence('ACDEFGHIKLMN', 'ACDEFGHIKLMN'),
      new Set([residues[7].key])
    ).length,
    0
  );
});
test('providers accept accessions only, retain partial success and do not follow arbitrary model URLs', async () => {
  const calls: string[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status });
  const source = {
    primaryAccession: 'P00698',
    sequence: { value: 'ACDEFGHIKLMN' },
    features: [],
  };
  const service = createAnnotationService((async (url: string) => {
    calls.push(url);
    return url.includes('rest.uniprot') ? json(source) : json({}, 503);
  }) as typeof fetch);
  await assert.rejects(service.reference('https://private.local'), /accession/);
  assert.equal(calls.length, 0);
  const result = await service.reference('P00698');
  assert.equal(result.sources[1].status, 'unavailable');
  assert.equal(result.sequence, source.sequence.value);
  const partial = createAnnotationService((async (url: string) =>
    url.includes('rest.uniprot')
      ? json(source)
      : json({ results: [], next: 'anything' })) as typeof fetch);
  assert.equal(
    (await partial.reference('P00698')).sources[1].status,
    'partial'
  );
  let requests = 0;
  const badModel = createAnnotationService((async () => {
    requests++;
    return json([
      {
        uniprotAccession: 'P00698',
        sequenceStart: 1,
        sequenceEnd: 12,
        sequence: source.sequence.value,
        pdbUrl: 'https://evil.example/private',
      },
    ]);
  }) as typeof fetch);
  await assert.rejects(badModel.model('P00698'), /No complete/);
  assert.equal(requests, 1);
});
test('malformed and oversized provider results fail without invented annotations', async () => {
  const huge = createAnnotationService(
    (async () =>
      new Response('bad', {
        headers: { 'content-length': '3000000' },
      })) as typeof fetch
  );
  await assert.rejects(huge.reference('P00698'), /too large/);
  const noentry = createAnnotationService(
    (async () => new Response('{}', { status: 404 })) as typeof fetch
  );
  await assert.rejects(noentry.reference('P00698'), /No entry/);
});
