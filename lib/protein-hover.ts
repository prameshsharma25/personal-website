import type {
  Annotation,
  Mapping,
  ReferenceProtein,
  Residue,
} from './protein-annotations';

export type ResiduePreview = {
  position: number | null;
  referenceLetter: string | null;
  annotations: Annotation[];
  message: string | null;
};

// Use the selected chain's mapping only. Author numbers and viewer numbers are
// deliberately not used as sequence indices (fragments and insertion codes differ).
export function residuePreview(
  residue: Residue,
  chain: string,
  reference: ReferenceProtein | null,
  mapping: Mapping | null
): ResiduePreview {
  const empty = (message: string): ResiduePreview => ({
    position: null,
    referenceLetter: null,
    annotations: [],
    message,
  });
  if (!reference) return empty('Load a reference to see annotations.');
  if (residue.chain !== chain)
    return empty(
      `Select chain ${residue.chain || 'Unnamed'} to map its annotations.`
    );
  if (!mapping?.usable)
    return empty('Reference mapping needs review. Annotations are withheld.');
  const position = mapping.positions[residue.position - 1];
  if (position == null)
    return empty('This residue has no mapped reference position.');
  const overlapping = (a: Annotation) =>
    a.spans.filter(([start, end]) => position >= start && position <= end);
  const specificity = (a: Annotation) =>
    Math.min(...overlapping(a).map(([start, end]) => end - start));
  const annotations = reference.annotations
    .filter((a) => overlapping(a).length > 0)
    // Show local features before broader domains. Keep source order for ties.
    .sort((a, b) => specificity(a) - specificity(b));
  return {
    position,
    referenceLetter: reference.sequence[position - 1] || null,
    annotations,
    message: annotations.length
      ? null
      : 'No annotation found at this position in the available sources.',
  };
}

export const AMINO_NAMES: Record<string, string> = {
  A: 'Alanine',
  R: 'Arginine',
  N: 'Asparagine',
  D: 'Aspartate',
  C: 'Cysteine',
  Q: 'Glutamine',
  E: 'Glutamate',
  G: 'Glycine',
  H: 'Histidine',
  I: 'Isoleucine',
  L: 'Leucine',
  K: 'Lysine',
  M: 'Methionine',
  F: 'Phenylalanine',
  P: 'Proline',
  S: 'Serine',
  T: 'Threonine',
  W: 'Tryptophan',
  Y: 'Tyrosine',
  V: 'Valine',
  U: 'Selenocysteine',
  O: 'Pyrrolysine',
  X: 'Unknown Amino Acid',
};
