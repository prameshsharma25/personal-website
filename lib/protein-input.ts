import {
  AMINO,
  ACCESSION,
  ANNOTATION_LIMITS,
  type ProteinInput,
  type Residue,
} from './protein-annotations';
type Atom = {
  chain: string;
  number: string;
  insertion: string;
  residue: string;
  atom: string;
  element: string;
  xyz: [number, number, number];
};

/** Tokenize CIF 1.x strings, comments, and semicolon text without treating quoted values as syntax. */
export function cifTokens(text: string): { value: string; quoted: boolean }[] {
  const tokens: { value: string; quoted: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }
    if (text[i] === '#') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    const quote = text[i];
    if (quote === ';' && (i === 0 || text[i - 1] === '\n')) {
      const end = text.indexOf('\n;', i + 1);
      if (end < 0)
        throw new Error('The mmCIF file has an unfinished text field.');
      tokens.push({ value: text.slice(i + 1, end), quoted: true });
      i = end + 2;
    } else if (quote === "'" || quote === '"') {
      const start = ++i;
      while (
        i < text.length &&
        !(
          text[i] === quote &&
          (i + 1 === text.length || /\s/.test(text[i + 1]))
        )
      )
        i++;
      if (i === text.length)
        throw new Error('The mmCIF file has an unfinished quoted value.');
      tokens.push({ value: text.slice(start, i++), quoted: true });
    } else {
      const start = i;
      while (i < text.length && !/\s/.test(text[i])) i++;
      tokens.push({ value: text.slice(start, i), quoted: false });
    }
    if (tokens.length > 650000)
      throw new Error('This mmCIF file is too complex for this preview.');
  }
  return tokens;
}
export function parseProteinStructure(
  text: string,
  name: string
): ProteinInput {
  if (
    new TextEncoder().encode(text).length > ANNOTATION_LIMITS.bytes ||
    text.includes('\0')
  )
    throw new Error('Choose a text structure file up to 5 MB.');
  const atoms: Atom[] = [];
  const add = (a: Atom, group: string, alt: string) => {
    if (
      !['ATOM', 'HETATM'].includes(group) ||
      !['', '.', '?', 'A', '1'].includes(alt) ||
      ['H', 'D'].includes(a.element)
    )
      return;
    if (group === 'HETATM' && !AMINO[a.residue]) return;
    if (!a.xyz.every(Number.isFinite))
      throw new Error('The structure contains invalid atom coordinates.');
    if (!/^-?\d+$/.test(a.number)) return;
    if (atoms.length >= ANNOTATION_LIMITS.atoms)
      throw new Error(
        'Use a structure with up to 30,000 protein atoms in its first model.'
      );
    atoms.push(a);
  };
  if (/\.pdb$/i.test(name)) {
    for (const line of text.split(/\r?\n/)) {
      if (/^ENDMDL/.test(line)) break;
      if (!/^(ATOM  |HETATM)/.test(line)) continue;
      add(
        {
          chain: line.slice(21, 22).trim(),
          number: line.slice(22, 26).trim(),
          insertion: line.slice(26, 27).trim(),
          residue: line.slice(17, 20).trim(),
          atom: line.slice(12, 16).trim(),
          element: line.slice(76, 78).trim() || line.slice(12, 16).trim()[0],
          xyz: [30, 38, 46].map((p) =>
            line.slice(p, p + 8).trim() ? Number(line.slice(p, p + 8)) : NaN
          ) as Atom['xyz'],
        },
        line.slice(0, 6).trim(),
        line.slice(16, 17).trim()
      );
    }
  } else if (/\.(cif|mmcif)$/i.test(name)) {
    const tokens = cifTokens(text);
    let found = false;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].quoted || tokens[i].value.toLowerCase() !== 'loop_')
        continue;
      const headers: string[] = [];
      let p = i + 1;
      while (
        p < tokens.length &&
        !tokens[p].quoted &&
        tokens[p].value.startsWith('_')
      )
        headers.push(tokens[p++].value.toLowerCase());
      if (!headers.some((h) => h.startsWith('_atom_site.'))) continue;
      if (found)
        throw new Error('Use a single structure data block per mmCIF file.');
      found = true;
      const indexes = new Map(
        headers.map((h, index) => [h.replace('_atom_site.', ''), index])
      );
      if (!['cartn_x', 'cartn_y', 'cartn_z'].every((h) => indexes.has(h)))
        throw new Error('The mmCIF file needs Cartesian atom coordinates.');
      let firstModel: string | undefined;
      while (
        p < tokens.length &&
        (tokens[p].quoted ||
          !/^(?:_|loop_|stop_|data_|save_)/i.test(tokens[p].value))
      ) {
        if (p + headers.length > tokens.length)
          throw new Error('The mmCIF atom table is incomplete.');
        const row = tokens.slice(p, p + headers.length);
        if (
          row.some(
            (t) => !t.quoted && /^(?:_|loop_|stop_|data_|save_)/i.test(t.value)
          )
        )
          throw new Error('The mmCIF atom table is incomplete.');
        const value = (...keys: string[]) => {
          for (const key of keys) {
            const index = indexes.get(key);
            if (index != null && !['.', '?'].includes(row[index].value))
              return row[index].value;
          }
          return '';
        };
        const model = value('pdbx_pdb_model_num') || '1';
        firstModel ??= model;
        if (model === firstModel)
          add(
            {
              chain: value('auth_asym_id', 'label_asym_id'),
              number: value('auth_seq_id', 'label_seq_id'),
              insertion: value('pdbx_pdb_ins_code'),
              residue: value('auth_comp_id', 'label_comp_id'),
              atom: value('auth_atom_id', 'label_atom_id'),
              element: value('type_symbol'),
              xyz: ['cartn_x', 'cartn_y', 'cartn_z'].map((k) =>
                value(k) ? Number(value(k)) : NaN
              ) as Atom['xyz'],
            },
            value('group_pdb') || 'ATOM',
            value('label_alt_id')
          );
        p += headers.length;
      }
      i = p - 1;
    }
  } else throw new Error('Choose a PDB or mmCIF file.');
  const groups = new Map<string, { residue: Residue; atoms: Atom[] }>();
  const chains = new Map<string, Residue[]>();
  for (const a of atoms) {
    const key = JSON.stringify([a.chain, a.number, a.insertion]);
    if (!groups.has(key))
      groups.set(key, {
        residue: {
          key,
          chain: a.chain,
          number: a.number + a.insertion,
          name: a.residue,
          letter: AMINO[a.residue] || 'X',
          position: 0,
        },
        atoms: [],
      });
    const group = groups.get(key)!;
    if (!group.atoms.some((atom) => atom.atom === a.atom)) group.atoms.push(a);
    if (a.atom === 'CA') group.residue.xyz = a.xyz;
  }
  const lines: string[] = [];
  let serial = 0;
  for (const { residue, atoms: group } of groups.values()) {
    if (!residue.xyz) continue;
    if (!chains.has(residue.chain)) chains.set(residue.chain, []);
    if (chains.size > ANNOTATION_LIMITS.chains)
      throw new Error('Choose a structure with up to 16 protein chains.');
    const residues = chains.get(residue.chain)!;
    if (residues.length >= ANNOTATION_LIMITS.residues)
      throw new Error('Use chains with up to 2,000 observed residues.');
    residue.position = residues.length + 1;
    residue.viewerPosition = residue.position;
    residue.viewerChain = 'ABCDEFGHIJKLMNOP'[
      [...chains.keys()].indexOf(residue.chain)
    ];
    residues.push(residue);
    // The viewer uses unique sequential identifiers. Original author numbering stays in residues.
    for (const a of group) {
      if (a.xyz.some((v) => v.toFixed(3).length > 8))
        throw new Error(
          'These coordinates exceed the display range. Center the structure around the origin and try again.'
        );
      const atomName =
        a.atom.length < 4 ? ` ${a.atom.padEnd(3)}` : a.atom.slice(0, 4);
      lines.push(
        `ATOM  ${String(++serial).padStart(5)} ${atomName} ${a.residue.padStart(3)} ${residue.viewerChain}${String(residue.position).padStart(4)}    ${a.xyz.map((v) => v.toFixed(3).padStart(8)).join('')}  1.00  0.00          ${a.element.padStart(2)}`
      );
    }
  }
  if (!chains.size)
    throw new Error(
      'No protein residues with alpha carbon coordinates were found in the first model.'
    );
  // DBREF identifiers are scoped to their author chain. Multiple distinct
  // references on one chain (for example a fusion) require manual review.
  const references = new Map<string, Set<string>>();
  if (/\.pdb$/i.test(name)) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('DBREF ')) continue;
      const chain = line.slice(12, 13).trim();
      const id = line.match(/\bUNP\s+([A-Z0-9-]+)\b/)?.[1];
      if (!id) continue;
      if (!references.has(chain)) references.set(chain, new Set());
      references.get(chain).add(id);
    }
  }
  const parsedChains = [...chains].map(([id, residues]) => ({
    id,
    residues,
    referenceAccession:
      references.get(id)?.size === 1 &&
      ACCESSION.test([...references.get(id)][0])
        ? [...references.get(id)][0]
        : undefined,
  }));
  const suggested = parsedChains[0].referenceAccession;
  return {
    name,
    kind: 'structure',
    chains: parsedChains,
    pdb: lines.join('\n') + '\nEND\n',
    suggestedAccession: suggested,
  };
}
