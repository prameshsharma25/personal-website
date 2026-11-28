export const ANNOTATION_LIMITS = {
  bytes: 5 * 1024 * 1024,
  residues: 2000,
  atoms: 30000,
  chains: 16,
};
export type Residue = {
  key: string;
  chain: string;
  number: string;
  name: string;
  letter: string;
  position: number;
  viewerChain?: string;
  viewerPosition?: number;
  xyz?: [number, number, number];
};
export type ProteinInput = {
  name: string;
  kind: 'sequence' | 'structure';
  chains: { id: string; residues: Residue[]; referenceAccession?: string }[];
  pdb?: string;
  suggestedAccession?: string;
  origin?: string;
};
export type Annotation = {
  id: string;
  source: 'UniProt' | 'InterPro';
  category: string;
  description: string;
  spans: [number, number][];
  evidence: { code: string; source?: string; id?: string }[];
  url: string;
  uncertainty?: string;
};
export type ReferenceProtein = {
  accession: string;
  name: string;
  organism: string;
  sequence: string;
  reviewed: boolean;
  version: string;
  retrievedAt: string;
  annotations: Annotation[];
  sources: {
    name: string;
    status: 'available' | 'unavailable' | 'partial';
    message?: string;
  }[];
};
export type Mapping = {
  positions: (number | null)[];
  identity: number;
  coverage: number;
  usable: boolean;
  exact: boolean;
  ambiguous: boolean;
  substitutions: number;
  method: string;
};
export const ACCESSION =
  /^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})$/;
export const AMINO: Record<string, string> = {
  ALA: 'A',
  ARG: 'R',
  ASN: 'N',
  ASP: 'D',
  CYS: 'C',
  GLN: 'Q',
  GLU: 'E',
  GLY: 'G',
  HIS: 'H',
  ILE: 'I',
  LEU: 'L',
  LYS: 'K',
  MET: 'M',
  PHE: 'F',
  PRO: 'P',
  SER: 'S',
  THR: 'T',
  TRP: 'W',
  TYR: 'Y',
  VAL: 'V',
  SEC: 'U',
  PYL: 'O',
  MSE: 'M',
  SEP: 'S',
  TPO: 'T',
  PTR: 'Y',
  UNK: 'X',
};
export function parseSequence(
  text: string,
  name = 'Uploaded Sequence'
): ProteinInput {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.filter((line) => line.startsWith('>'));
  if (headers.length > 1 || (headers.length && !lines[0].startsWith('>')))
    throw new Error('Choose a single protein sequence per FASTA file.');
  const sequence = lines
    .filter((line) => !line.startsWith('>'))
    .join('')
    .replace(/\s/g, '')
    .toUpperCase()
    .replace(/\*$/, '');
  if (!/^[ACDEFGHIKLMNPQRSTVWYBXZJUO]+$/.test(sequence))
    throw new Error(
      'Enter a protein sequence using amino acid letters, optionally with one FASTA header.'
    );
  if (sequence.length < 5 || sequence.length > ANNOTATION_LIMITS.residues)
    throw new Error('Use a sequence with 5 to 2,000 residues.');
  const accession = headers[0]?.match(/(?:sp|tr)\|([A-Z0-9]+)\|/)?.[1];
  return {
    name: headers[0]?.slice(1, 150) || name,
    kind: 'sequence',
    suggestedAccession:
      accession && ACCESSION.test(accession) ? accession : undefined,
    chains: [
      {
        id: 'Sequence',
        residues: [...sequence].map((letter, i) => ({
          key: `seq:${i}`,
          chain: 'Sequence',
          number: String(i + 1),
          name: letter,
          letter,
          position: i + 1,
        })),
      },
    ],
  };
}

/** Align all of the query to a substring of the reference. Reference terminal gaps are free.
 * Bounded quadratic work: at most 4 million cells. No coordinate numbering assumptions.
 * Repeated exact fragments are rejected rather than assigned to an arbitrary domain. */
export function mapSequence(query: string, reference: string): Mapping {
  if (
    !query.length ||
    !reference.length ||
    query.length > 2000 ||
    reference.length > 2000
  )
    throw new Error(
      'Reference mapping supports up to 2,000 residues per sequence.'
    );
  const exactStart = reference.indexOf(query);
  if (exactStart >= 0 && !/[XBZJ]/.test(query)) {
    const ambiguous = reference.indexOf(query, exactStart + 1) >= 0;
    return {
      positions: [...query].map((_, i) => i + exactStart + 1),
      identity: 1,
      coverage: 1,
      usable: !ambiguous,
      exact: query === reference,
      ambiguous,
      substitutions: 0,
      method: 'Exact sequence substring',
    };
  }
  const n = query.length,
    m = reference.length,
    width = m + 1;
  const trace = new Uint8Array((n + 1) * width);
  let previous = new Int32Array(width),
    current = new Int32Array(width);
  let previousWays = new Uint8Array(width).fill(1),
    currentWays = new Uint8Array(width);
  for (let i = 1; i <= n; i++) {
    current[0] = -3 * i;
    currentWays[0] = 1;
    for (let j = 1; j <= m; j++) {
      const match =
        query[i - 1] === reference[j - 1] && !/[XBZJ]/.test(query[i - 1]);
      const diagonal = previous[j - 1] + (match ? 3 : -2),
        up = previous[j] - 3,
        left = current[j - 1] - 3;
      current[j] = Math.max(diagonal, up, left);
      currentWays[j] = Math.min(
        2,
        (current[j] === diagonal ? previousWays[j - 1] : 0) +
          (current[j] === up ? previousWays[j] : 0) +
          (current[j] === left ? currentWays[j - 1] : 0)
      );
      trace[i * width + j] =
        current[j] === diagonal ? 1 : current[j] === up ? 2 : 3;
    }
    [previous, current] = [current, previous];
    [previousWays, currentWays] = [currentWays, previousWays];
  }
  let end = 0;
  for (let j = 1; j <= m; j++) if (previous[j] > previous[end]) end = j;
  let ambiguous = previousWays[end] > 1;
  for (let j = 0; j <= m; j++)
    if (j !== end && previous[j] === previous[end]) ambiguous = true;
  const positions: (number | null)[] = Array(n).fill(null);
  let i = n,
    j = end,
    matches = 0,
    aligned = 0;
  while (i > 0 && j > 0) {
    const step = trace[i * width + j];
    if (step === 1) {
      positions[i - 1] = j;
      aligned++;
      if (query[i - 1] === reference[j - 1] && !/[XBZJ]/.test(query[i - 1]))
        matches++;
      i--;
      j--;
    } else if (step === 2) i--;
    else j--;
  }
  const identity = aligned ? matches / aligned : 0,
    coverage = aligned / n;
  return {
    positions,
    identity,
    coverage,
    usable:
      identity >= 0.9 &&
      coverage >= 0.9 &&
      matches >= Math.min(20, n) &&
      !ambiguous,
    exact: false,
    ambiguous,
    substitutions: aligned - matches,
    method:
      'Semiglobal sequence alignment; match 3, mismatch −2, gap −3; free reference termini',
  };
}

export function annotationPositions(
  annotation: Annotation,
  residues: Residue[],
  mapping: Mapping
): Residue[] {
  if (!mapping.usable) return [];
  return residues.filter(
    (_, i) =>
      mapping.positions[i] != null &&
      annotation.spans.some(
        ([start, end]) =>
          mapping.positions[i]! >= start && mapping.positions[i]! <= end
      )
  );
}
export function regionAnnotations(
  annotations: Annotation[],
  residues: Residue[],
  mapping: Mapping,
  selected: Set<string>
) {
  return annotations.filter((annotation) =>
    annotationPositions(annotation, residues, mapping).some((residue) =>
      selected.has(residue.key)
    )
  );
}
export function neighbors(
  residues: Residue[],
  selected: Set<string>,
  radius: number
): string[] {
  if (!Number.isFinite(radius) || radius < 1 || radius > 12)
    return [...selected];
  const anchors = residues.filter((r) => selected.has(r.key) && r.xyz);
  return residues
    .filter(
      (r) =>
        selected.has(r.key) ||
        (r.xyz &&
          anchors.some(
            (a) =>
              a.xyz!.reduce((sum, v, k) => sum + (v - r.xyz![k]) ** 2, 0) <=
              radius ** 2
          ))
    )
    .map((r) => r.key);
}

type UniProtRecord = {
  primaryAccession?: string;
  sequence?: { value: string };
  entryType?: string;
  uniProtkbId?: string;
  organism?: { scientificName?: string };
  entryAudit?: { entryVersion?: number };
  proteinDescription?: {
    recommendedName?: { fullName?: { value: string } };
    submissionNames?: { fullName?: { value: string } }[];
  };
  features?: {
    type: string;
    location?: {
      start?: { value?: number; modifier?: string };
      end?: { value?: number; modifier?: string };
    };
    description?: string;
    ligand?: { name?: string };
    alternativeSequence?: {
      originalSequence?: string;
      alternativeSequences?: string[];
    };
    evidences?: { evidenceCode: string; source?: string; id?: string }[];
  }[];
};
type InterProResponse = {
  results?: {
    metadata?: { accession?: string; name?: string; type?: string };
    proteins?: {
      accession?: string;
      entry_protein_locations?: {
        fragments?: { start?: number; end?: number }[];
      }[];
    }[];
  }[];
};
export function normalizeUniProt(
  data: UniProtRecord,
  date = new Date().toISOString()
): ReferenceProtein {
  if (
    !ACCESSION.test(data?.primaryAccession || '') ||
    !/^[A-Z]+$/.test(data?.sequence?.value || '') ||
    data.sequence.value.length > 2000
  )
    throw new Error('This reference is unavailable or exceeds 2,000 residues.');
  const annotations: Annotation[] = [];
  for (const [index, feature] of (Array.isArray(data.features)
    ? data.features
    : []
  ).entries()) {
    const start = feature.location?.start,
      end = feature.location?.end;
    if (
      !Number.isInteger(start?.value) ||
      !Number.isInteger(end?.value) ||
      start.value < 1 ||
      end.value < start.value ||
      end.value > data.sequence.value.length
    )
      continue;
    // A bond connects its endpoints. Its interior is not a binding region.
    const endpoints = ['Disulfide bond', 'Cross-link'].includes(feature.type);
    const variants = feature.alternativeSequence;
    const description = [
      feature.description,
      feature.ligand?.name && `Ligand: ${feature.ligand.name}`,
      variants &&
        `${variants.originalSequence || '?'} → ${(variants.alternativeSequences || []).join(', ')}`,
    ]
      .filter(Boolean)
      .join('. ');
    annotations.push({
      id: `uniprot:${index}`,
      source: 'UniProt',
      category: String(feature.type),
      description: description || String(feature.type),
      spans: endpoints
        ? [
            [start.value, start.value],
            [end.value, end.value],
          ]
        : [[start.value, end.value]],
      evidence: (feature.evidences || []).map((e) => ({
        code: e.evidenceCode,
        source: e.source,
        id: e.id,
      })),
      url: `https://www.uniprot.org/uniprotkb/${data.primaryAccession}/entry`,
      uncertainty:
        start.modifier !== 'EXACT' || end.modifier !== 'EXACT'
          ? 'Source marks a boundary as uncertain.'
          : undefined,
    });
  }
  return {
    accession: data.primaryAccession,
    name:
      data.proteinDescription?.recommendedName?.fullName?.value ||
      data.proteinDescription?.submissionNames?.[0]?.fullName?.value ||
      data.uniProtkbId ||
      data.primaryAccession,
    organism: data.organism?.scientificName || 'Not specified',
    sequence: data.sequence.value,
    reviewed:
      String(data.entryType).includes('reviewed') &&
      !String(data.entryType).includes('unreviewed'),
    version: String(data.entryAudit?.entryVersion || 'Unknown'),
    retrievedAt: date,
    annotations,
    sources: [{ name: 'UniProt', status: 'available' }],
  };
}
export function normalizeInterPro(
  data: InterProResponse,
  accession: string
): Annotation[] {
  if (!Array.isArray(data?.results))
    throw new Error('InterPro returned an unreadable response.');
  return data.results.flatMap((entry) => {
    const metadata = entry.metadata;
    if (!/^IPR\d+$/.test(metadata?.accession || '')) return [];
    const protein = entry.proteins?.find(
      (p) => p.accession?.toUpperCase() === accession
    );
    return (protein?.entry_protein_locations || []).flatMap(
      (location, index: number) => {
        const spans = (location.fragments || [])
          .filter(
            (f) =>
              Number.isInteger(f.start) &&
              Number.isInteger(f.end) &&
              f.start > 0 &&
              f.end >= f.start &&
              f.end <= 2000
          )
          .map((f) => [f.start, f.end] as [number, number]);
        return spans.length
          ? [
              {
                id: `interpro:${metadata.accession}:${index}`,
                source: 'InterPro' as const,
                category: String(metadata.type || 'Domain')
                  .replace(/_/g, ' ')
                  .replace(/^./, (c) => c.toUpperCase()),
                description: `${metadata.name} (${metadata.accession})`,
                spans,
                evidence: [{ code: 'Computational signature match' }],
                url: `https://www.ebi.ac.uk/interpro/entry/InterPro/${metadata.accession}/`,
              },
            ]
          : [];
      }
    );
  });
}

export function evidenceUrl(source?: string, id?: string) {
  if (source === 'PubMed' && /^\d+$/.test(id || ''))
    return `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
  if (source === 'PDB' && /^[a-z0-9]{4}$/i.test(id || ''))
    return `https://www.rcsb.org/structure/${id}`;
  return null;
}
