import {
  ACCESSION,
  ANNOTATION_LIMITS,
  type ProteinInput,
} from './protein-annotations';
import { parseProteinStructure } from './protein-input';

/** Validate the requested identity and coordinates before replacing either comparison input. */
export function parseAccessionModel(
  accession: string,
  data: unknown
): ProteinInput {
  const id = accession.trim().toUpperCase();
  if (!ACCESSION.test(id))
    throw new Error('Enter a canonical UniProt accession, such as Q96AE4.');
  if (!data || typeof data !== 'object')
    throw new Error('The model response could not be read.');
  const model = data as Record<string, unknown>;
  const source =
    typeof model.url === 'string' &&
    model.url.match(
      new RegExp(
        `^https://alphafold\\.ebi\\.ac\\.uk/files/AF-${id}-F1-model_v([0-9]+)\\.pdb$`
      )
    );
  if (!source)
    throw new Error(
      'The returned model does not match the requested UniProt accession.'
    );
  if (
    typeof model.sequence !== 'string' ||
    !/^[A-Z]+$/.test(model.sequence) ||
    model.sequence.length > ANNOTATION_LIMITS.residues
  )
    throw new Error(
      'The model sequence is missing or exceeds the 2,000 residue limit. Upload a smaller structure instead.'
    );
  if (
    typeof model.text !== 'string' ||
    new TextEncoder().encode(model.text).byteLength > ANNOTATION_LIMITS.bytes
  )
    throw new Error(
      'The model coordinates are missing or exceed the 5 MB limit.'
    );
  const input = parseProteinStructure(model.text, `AF-${id}.pdb`);
  if (
    input.chains.length !== 1 ||
    input.chains[0].residues.map((r) => r.letter).join('') !== model.sequence
  )
    throw new Error(
      'The downloaded coordinates do not match the model sequence. The current protein has been kept. Try again or upload a matching structure.'
    );
  return {
    ...input,
    suggestedAccession: id,
    origin: `AlphaFold DB prediction for ${id}; model version ${source[1]}. Source: ${model.url}`,
  };
}
