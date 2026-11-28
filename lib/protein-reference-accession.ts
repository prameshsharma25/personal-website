import { ACCESSION, type ProteinInput } from './protein-annotations';

/** Use explicit identifiers only. Filenames and structural similarity do not establish identity. */
export function referenceAccession(
  input: ProteinInput | null,
  chain: string
): string | null {
  const selected = input?.chains.find((c) => c.id === chain);
  if (!selected) return null;
  const id =
    selected.referenceAccession ||
    (input.chains.length === 1 ? input.suggestedAccession : undefined);
  return id && ACCESSION.test(id) ? id : null;
}
