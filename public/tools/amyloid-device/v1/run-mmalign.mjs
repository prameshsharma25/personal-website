// Separate Emscripten module; no native subprocess or uploaded files are used.
export async function alignmentRunner(script, binary) {
  const url = URL.createObjectURL(
    new Blob([script], { type: 'text/javascript' })
  );
  let create;
  try {
    ({ default: create } = await import(url));
  } finally {
    URL.revokeObjectURL(url);
  }
  return async (a, b) => {
    const output = [];
    const errors = [];
    const instance = await create({
      noInitialRun: true,
      // Emscripten resolves this even when wasmBinary is supplied. A blob import
      // has no relative URL base, so keep its location explicitly on this site.
      locateFile: (name) => new URL(`./mmalign/${name}`, import.meta.url).href,
      wasmBinary: new Uint8Array(binary),
      print: (line) => output.push(line),
      printErr: (line) => errors.push(line),
    });
    instance.FS.writeFile('/a.pdb', a);
    instance.FS.writeFile('/b.pdb', b);
    const status = instance.callMain(['/a.pdb', '/b.pdb']);
    if (status !== 0)
      throw new Error(
        `MM-align stopped with status ${status}. ${errors.join(' ')}`
      );
    return output.join('\n');
  };
}
