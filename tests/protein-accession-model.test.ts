import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseAccessionModel } from '../lib/protein-accession-model';
import { parseProteinStructure } from '../lib/protein-input';
import {
  createAnnotationService,
  AnnotationRequestError,
} from '../lib/protein-annotations-server';

// Reuse local coordinates for a synthetic provider response, not an AlphaFold reference fixture.
const text = fs.readFileSync(
  'public/tools/protein-annotations/1LYZ.pdb',
  'utf8'
);
const sequence = parseProteinStructure(text, 'fixture.pdb')
  .chains[0].residues.map((r) => r.letter)
  .join('');
const url = 'https://alphafold.ebi.ac.uk/files/AF-P00698-F1-model_v6.pdb';
const model = {
  text,
  sequence,
  url,
  name: 'provider-name.pdb',
  label: 'provider label',
};

test('accession model parser checks coordinates and preserves canonical identity and source provenance', () => {
  const input = parseAccessionModel(' p00698 ', model);
  assert.equal(input.name, 'AF-P00698.pdb');
  assert.equal(input.suggestedAccession, 'P00698');
  assert.equal(input.chains[0].residues.length, 129);
  assert.match(
    input.origin!,
    /AlphaFold DB prediction for P00698; model version 6/
  );
  assert.ok(input.origin!.includes(url));
});
test('accession model parser rejects wrong identities, malformed responses, partial coordinates, and sequence differences', () => {
  assert.throws(() => parseAccessionModel('P00698-2', model), /canonical/);
  assert.throws(() => parseAccessionModel('Q96AE4', model), /does not match/);
  assert.throws(
    () =>
      parseAccessionModel('P00698', {
        ...model,
        url: 'https://evil.example/model.pdb',
      }),
    /does not match/
  );
  assert.throws(
    () =>
      parseAccessionModel('P00698', { ...model, sequence: 'ACD' + sequence }),
    /coordinates do not match/
  );
  assert.throws(
    () =>
      parseAccessionModel('P00698', {
        ...model,
        sequence: sequence.slice(0, -1),
      }),
    /coordinates do not match/
  );
  assert.throws(
    () => parseAccessionModel('P00698', { ...model, sequence: undefined }),
    /sequence is missing/
  );
  assert.throws(
    () =>
      parseAccessionModel('P00698', { ...model, sequence: 'A'.repeat(2001) }),
    /2,000/
  );
  assert.throws(
    () =>
      parseAccessionModel('P00698', {
        ...model,
        text: 'x'.repeat(5 * 1024 * 1024 + 1),
      }),
    /5 MB/
  );
});
test('model retrieval supports either provider sequence field and validates the entire structure response', async () => {
  for (const field of ['sequence', 'uniprotSequence']) {
    const calls: string[] = [];
    const service = createAnnotationService((async (request: string) => {
      calls.push(request);
      return request.includes('/api/prediction/')
        ? new Response(
            JSON.stringify([
              {
                uniprotAccession: 'P00698',
                sequenceStart: 1,
                sequenceEnd: sequence.length,
                [field]: sequence,
                pdbUrl: url,
                latestVersion: 6,
              },
            ])
          )
        : new Response(text);
    }) as typeof fetch);
    const response = await service.model('P00698');
    assert.equal(response.sequence, sequence);
    assert.equal(parseAccessionModel('P00698', response).name, 'AF-P00698.pdb');
    assert.deepEqual(calls, [
      'https://alphafold.ebi.ac.uk/api/prediction/P00698',
      url,
    ]);
  }
});
test('model retrieval gives an upload fallback and does not fetch a partial or contradictory model', async () => {
  const absent = createAnnotationService(
    (async () => new Response('{}', { status: 404 })) as typeof fetch
  );
  await assert.rejects(
    absent.model('P00698'),
    (e: AnnotationRequestError) =>
      e.status === 404 && /Upload a PDB or mmCIF/.test(e.message)
  );
  for (const change of [
    { sequenceStart: 4 },
    { sequenceEnd: sequence.length - 1 },
    { uniprotAccession: 'Q96AE4' },
    { uniprotSequence: 'A'.repeat(sequence.length) },
  ]) {
    let calls = 0;
    const service = createAnnotationService((async () => {
      calls++;
      return new Response(
        JSON.stringify([
          {
            uniprotAccession: 'P00698',
            sequenceStart: 1,
            sequenceEnd: sequence.length,
            sequence,
            pdbUrl: url,
            ...change,
          },
        ])
      );
    }) as typeof fetch);
    await assert.rejects(service.model('P00698'), /No complete AlphaFold/);
    assert.equal(calls, 1);
  }
});
