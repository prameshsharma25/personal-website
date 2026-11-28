import type { ProteinInput } from './protein-annotations';

export type ProteinColorMode =
  | 'Annotations'
  | 'Chain'
  | 'Structure'
  | 'Difference'
  | 'Chainbow'
  | 'Secondary Structure'
  | 'Residue Chemistry';

export const EXTRA_COLOR_MODES: ProteinColorMode[] = [
  'Chainbow',
  'Secondary Structure',
  'Residue Chemistry',
];
export const CHAIN_COLORS = ['#7fb8ed', '#c2a5ef', '#70d8c2', '#efb579'];
export const RAINBOW_COLORS = [
  0x568bff, 0x42d8e5, 0x61d58e, 0xffda68, 0xff6b66,
];
export const SECONDARY_COLORS = {
  Helix: '#b79bff',
  Sheet: '#f3c973',
  Loop: '#6dd7c4',
  Unassigned: '#7a8799',
};
export const CHEMISTRY_COLORS = {
  Hydrophobic: '#efb579',
  Polar: '#70d8c2',
  Acidic: '#f48b9e',
  Basic: '#91a8ff',
  'Gly / Pro': '#cfabef',
  Other: '#7a8799',
};
export const colorHex = (value: number) =>
  `#${value.toString(16).padStart(6, '0')}`;

function rainbow(index: number, length: number) {
  const position =
    (length > 1 ? index / (length - 1) : 0.5) * (RAINBOW_COLORS.length - 1);
  const lower = Math.floor(position),
    upper = Math.min(lower + 1, RAINBOW_COLORS.length - 1);
  const mix = position - lower;
  return [16, 8, 0].reduce((rgb, shift) => {
    const start = (RAINBOW_COLORS[lower] >> shift) & 255;
    const end = (RAINBOW_COLORS[upper] >> shift) & 255;
    return rgb | (Math.round(start + (end - start) * mix) << shift);
  }, 0);
}

function chemistry(letter: string) {
  if ('AVILMFWY'.includes(letter)) return CHEMISTRY_COLORS.Hydrophobic;
  if ('STNQCU'.includes(letter)) return CHEMISTRY_COLORS.Polar;
  if ('DE'.includes(letter)) return CHEMISTRY_COLORS.Acidic;
  if ('KRH'.includes(letter)) return CHEMISTRY_COLORS.Basic;
  if ('GP'.includes(letter)) return CHEMISTRY_COLORS['Gly / Pro'];
  return CHEMISTRY_COLORS.Other;
}

/** Sequence order within each loaded chain, independent of author numbering or alignment. */
export function residueColorLookup(chains: ProteinInput['chains']) {
  return new Map(
    chains.flatMap((chain) =>
      chain.residues.map(
        (residue, index) =>
          [
            `${residue.viewerChain}:${residue.viewerPosition}`,
            {
              chainbow: rainbow(index, chain.residues.length),
              chemistry: chemistry(residue.letter),
            },
          ] as const
      )
    )
  );
}

export function secondaryColor(ss?: string) {
  // 3Dmol may replace the assignment with a cartoon endpoint marker during rendering.
  if (ss === 'h' || ss === 'tube start' || ss === 'tube end')
    return SECONDARY_COLORS.Helix;
  if (ss === 's' || ss === 'arrow start' || ss === 'arrow end')
    return SECONDARY_COLORS.Sheet;
  return ss === 'c' ? SECONDARY_COLORS.Loop : SECONDARY_COLORS.Unassigned;
}

export function residueColor(
  mode: ProteinColorMode,
  atom: { chain: string; resi: number; ss?: string },
  colors: ReturnType<typeof residueColorLookup>,
  fallback: string | number
) {
  const residue = colors.get(`${atom.chain}:${atom.resi}`);
  if (mode === 'Chainbow') return residue?.chainbow ?? '#7a8799';
  if (mode === 'Residue Chemistry') return residue?.chemistry ?? '#7a8799';
  if (mode === 'Secondary Structure') return secondaryColor(atom.ss);
  return fallback;
}
