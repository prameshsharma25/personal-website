// One independent Python runtime per worker. Inputs and outputs stay on device.
import { pythonMemoryBytes } from './diagnostics.mjs';
const RUNTIME = 'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/';
let python,
  probe,
  initialized = false,
  busy = false;
function memory() {
  return pythonMemoryBytes(probe);
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      if (initialized)
        throw new Error('Descriptor worker already initialized.');
      initialized = true;
      if (
        data.engine.runtime_url !== RUNTIME ||
        data.engine.pyodide !== '314.0.8'
      )
        throw new Error('Unsupported descriptor runtime.');
      const { loadPyodide } = await import(`${RUNTIME}pyodide.mjs`);
      python = await loadPyodide({
        indexURL: RUNTIME,
        stdout() {},
        stderr() {},
      });
      await python.loadPackage(['numpy', 'biopython', 'freesasa'], {
        checkIntegrity: true,
      });
      python.unpackArchive(data.packageBytes, 'zip', {
        extractDir: '/research',
      });
      python.globals.set('_engine_json', JSON.stringify(data.engine));
      python.globals.set('_settings_json', '{}');
      python.globals.set('_batch_enabled', false);
      python.registerJsModule('device_progress', {
        report: (stage, completed) =>
          postMessage({
            type: 'progress',
            stage,
            completed,
            memoryBytes: memory(),
          }),
      });
      await python.runPythonAsync(
        "import sys\nsys.path.insert(0, '/research')"
      );
      await python.runPythonAsync(new TextDecoder().decode(data.analysisBytes));
      await python.runPythonAsync('validate_versions()');
      probe = python.runPython('bytearray(1)');
      python.FS.mkdirTree('/device/inputs');
      postMessage({ type: 'ready', memoryBytes: memory() });
    } else if (data.type === 'analyze') {
      if (!python || busy) throw new Error('Descriptor worker is not ready.');
      busy = true;
      const started = performance.now();
      const { entry } = data;
      if (
        !/^model-\d{3}$/.test(entry.id) ||
        !new RegExp(`^${entry.id}\\.(pdb|cif|mmcif)$`).test(entry.stored_name)
      )
        throw new Error('Invalid structure identity.');
      python.FS.writeFile(
        `/device/inputs/${entry.stored_name}`,
        new Uint8Array(data.bytes)
      );
      python.globals.set('_entry_json', JSON.stringify(entry));
      const model = JSON.parse(
        await python.runPythonAsync('analyze_entry(_entry_json)')
      );
      const paths = JSON.parse(
        await python.runPythonAsync('descriptor_paths(_entry_json)')
      );
      const artifacts = paths.map((path) => ({
        path,
        bytes: python.FS.readFile(`/device/artifacts/${path}`).slice().buffer,
      }));
      const memoryBytes = memory();
      await python.runPythonAsync('release_descriptor(_entry_json)');
      busy = false;
      postMessage(
        {
          type: 'result',
          model,
          artifacts,
          elapsedMs: performance.now() - started,
          memoryBytes,
        },
        artifacts.map((item) => item.bytes)
      );
    }
  } catch (error) {
    postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
