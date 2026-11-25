// No coordinates leave this worker. Network requests load only versioned engine assets.
const BASE = new URL('./', import.meta.url);
const RUNTIME = 'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/';
let started = false;
async function asset(name, expected) {
  const response = await fetch(new URL(name, BASE), {
    cache: 'no-cache',
    credentials: 'omit',
  });
  if (!response.ok)
    throw new Error(
      `Could not load ${name}. Check your connection and try again.`
    );
  const bytes = await response.arrayBuffer();
  if (expected) {
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0')
    ).join('');
    if (digest !== expected)
      throw new Error(
        'The analysis engine failed its integrity check. Reload this page and try again.'
      );
  }
  return bytes;
}
function progress(stage, completed, total, filename = '') {
  postMessage({ type: 'progress', stage, completed, total, filename });
}
self.onmessage = async ({ data }) => {
  if (started || data.type !== 'start') return;
  started = true;
  try {
    progress('Loading The Analysis Engine', 0, data.files.length);
    const engine = JSON.parse(
      new TextDecoder().decode(await asset('engine.json'))
    );
    const { limits } = engine;
    if (engine.pyodide !== '314.0.8' || engine.runtime_url !== RUNTIME)
      throw new Error('Unsupported analysis engine version. Reload this page.');
    if (
      !data.files.length ||
      data.files.length > limits.max_files ||
      data.files.some(
        (f) =>
          !/\.(pdb|cif|mmcif)$/i.test(f.name) ||
          !f.bytes.byteLength ||
          f.bytes.byteLength > limits.max_file_bytes
      ) ||
      data.files.reduce((s, f) => s + f.bytes.byteLength, 0) >
        limits.max_total_bytes
    )
      throw new Error(
        'Select up to 5 PDB or mmCIF files: 10 MB each, 25 MB total.'
      );
    const { loadPyodide } = await import(`${RUNTIME}pyodide.mjs`);
    const python = await loadPyodide({
      indexURL: RUNTIME,
      stdout: () => {},
      stderr: () => {},
    });
    await python.loadPackage(['numpy', 'biopython', 'freesasa'], {
      checkIntegrity: true,
    });
    python.unpackArchive(
      await asset('package.zip', engine.files['package.zip']),
      'zip',
      { extractDir: '/research' }
    );
    python.globals.set('_engine_json', JSON.stringify(engine));
    await python.runPythonAsync("import sys\nsys.path.insert(0, '/research')");
    await python.runPythonAsync(
      new TextDecoder().decode(
        await asset('analysis.py', engine.files['analysis.py'])
      )
    );
    python.FS.mkdirTree('/device/inputs');
    for (let index = 0; index < data.files.length; index++) {
      const file = data.files[index];
      const id = `model-${String(index + 1).padStart(3, '0')}`;
      const extension = file.name.match(/\.(pdb|cif|mmcif)$/i)[1].toLowerCase();
      const entry = {
        id,
        filename: file.name,
        stored_name: `${id}.${extension}`,
      };
      progress(
        'Calculating Descriptors And Warnings',
        index,
        data.files.length,
        file.name
      );
      python.FS.writeFile(
        `/device/inputs/${entry.stored_name}`,
        new Uint8Array(file.bytes)
      );
      file.bytes = null;
      python.globals.set('_entry_json', JSON.stringify(entry));
      const model = JSON.parse(
        await python.runPythonAsync('analyze_entry(_entry_json)')
      );
      postMessage({ type: 'model', model });
    }
    progress('Preparing Your Download', data.files.length, data.files.length);
    const result = JSON.parse(await python.runPythonAsync('finish()'));
    const artifacts = {};
    const transfers = [];
    for (const model of result.structures) {
      if (!model.files) continue;
      artifacts[model.id] = Object.values(model.files).map((path) => {
        const bytes = python.FS.readFile(`/device/artifacts/${path}`).slice()
          .buffer;
        transfers.push(bytes);
        return { name: path.split('/').pop(), bytes };
      });
    }
    const archive = python.FS.readFile(
      '/device/amyloid-device-results.zip'
    ).slice().buffer;
    transfers.push(archive);
    postMessage({ type: 'complete', result, artifacts, archive }, transfers);
  } catch (error) {
    postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
