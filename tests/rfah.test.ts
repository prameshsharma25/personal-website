import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import structures from '../data/rfah.json';

test('RfaH data retain the deposited atom coordinates, residue identities, and complete selected backbone', () => {
  for (const structure of Object.values(structures)) {
    const bytes = readFileSync(`public${structure.file}`), lines = bytes.toString().split('\n');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), structure.excerptSha256);
    const atoms = lines.filter(line => line.startsWith('ATOM'));
    assert.equal(atoms.length, structure.atomCount);
    assert.ok(atoms.every(line => line[21] === 'A' && line.slice(76, 78).trim() !== 'H'));
    const ca = atoms.filter(line => line.slice(12, 16).trim() === 'CA');
    const coordinates = ca.map(line => [Number(line.slice(30, 38)), Number(line.slice(38, 46)), Number(line.slice(46, 54))]);
    assert.deepEqual(coordinates, structure.coordinates);
    assert.deepEqual(ca.map(line => Number(line.slice(22, 26))), structure.residues);
    for (let i = 1; i < coordinates.length; i++) {
      const distance = Math.hypot(...coordinates[i].map((value, axis) => value - coordinates[i - 1][axis]));
      assert.ok(distance > 3.5 && distance < 4.1, `${structure.pdb} residue ${structure.residues[i]} has a broken backbone`);
    }
  }
  assert.equal(structures.alpha.sequence, structures.beta.sequence.slice(0, 42));
  assert.equal(structures.alpha.coordinates.length, 42); // 2OUG has no modeled CTD residues beyond 156.
  assert.equal(structures.beta.coordinates.length, 48); // Preserve beta strand 5, residues 159–161.
  const beta = readFileSync(`public${structures.beta.file}`, 'utf8');
  assert.match(beta, /SHEET\s+5\s+A\s+5 PHE A 159\s+LYS A 161/);
  assert.ok(!beta.includes('MODEL        2'));
});
