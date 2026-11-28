// Reuse the unchanged, pinned MM-align WebAssembly distributed with the amyloid
// tool. Attribution, license, and reproducible build record stay alongside it.
import createMMalign from '../amyloid-device/v1/mmalign/mmalign.mjs';
export const STRUCTURAL_ENGINE = {
  name: 'MM-align',
  sourceCommit: '23f14ffcf8647f2dc1c0e01043db3a7f3a661c28',
  sourceUrl:
    'https://github.com/pylelab/USalign/tree/23f14ffcf8647f2dc1c0e01043db3a7f3a661c28',
  buildRecord: '/tools/amyloid-device/v1/mmalign/build.json',
  license: '/tools/amyloid-device/v1/mmalign/LICENSE.txt',
};
export async function runStructuralAlignment(moving, fixed, wasmBinary) {
  const output = [],
    errors = [];
  const instance = await createMMalign({
    noInitialRun: true,
    locateFile: (name) =>
      new URL(`../amyloid-device/v1/mmalign/${name}`, import.meta.url).href,
    ...(wasmBinary ? { wasmBinary } : {}),
    print: (line) => output.push(line),
    printErr: (line) => errors.push(line),
  });
  const args = [
    '/comparison.pdb',
    '/primary.pdb',
    '-m',
    '/transform.txt',
    '-mol',
    'protein',
    '-TMcut',
    '-1',
  ];
  try {
    instance.FS.writeFile('/comparison.pdb', moving);
    instance.FS.writeFile('/primary.pdb', fixed);
    const status = instance.callMain(args);
    if (status !== 0)
      throw new Error(
        `MM-align stopped with status ${status}. ${errors.join(' ')}`
      );
    return {
      stdout: output.join('\n'),
      matrix: instance.FS.readFile('/transform.txt', { encoding: 'utf8' }),
      engine: STRUCTURAL_ENGINE,
      arguments: args,
    };
  } finally {
    for (const name of ['/comparison.pdb', '/primary.pdb', '/transform.txt']) {
      try {
        instance.FS.unlink(name);
      } catch {
        /* May not exist after an engine failure. */
      }
    }
  }
}
