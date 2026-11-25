// No coordinates leave this worker. Network requests load only versioned engine assets.
import { alignmentRunner } from './run-mmalign.mjs';
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
function progress(stage, completed, total, filename = '', phase = 'setup') {
  postMessage({ type: 'progress', stage, completed, total, filename, phase });
}
self.onmessage = async ({ data }) => {
  if (started || data.type !== 'start') return;
  started = true;
  try {
    progress('Loading The Analysis Engine', 0, 0);
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
        `Select up to ${limits.max_files} PDB or mmCIF files: ${limits.max_file_bytes / 1024 ** 2} MB each, ${limits.max_total_bytes / 1024 ** 2} MB total.`
      );
    const settings = data.settings || {
      min_cluster_size: 10,
      min_samples: 3,
      max_candidates: 10,
    };
    if (
      !Number.isInteger(settings.min_cluster_size) ||
      settings.min_cluster_size < 2 ||
      settings.min_cluster_size > limits.max_files ||
      !Number.isInteger(settings.min_samples) ||
      settings.min_samples < 1 ||
      settings.min_samples >= limits.max_files ||
      settings.max_candidates !== 10
    )
      throw new Error('Invalid clustering settings.');
    if (new Set(data.files.map((file) => file.name)).size !== data.files.length)
      throw new Error('Rename duplicate filenames before analysis.');
    if (data.confidence && data.confidence.byteLength > 65536)
      throw new Error('Confidence CSV must be at most 64 KB.');
    const batch = Boolean(data.compare && data.files.length > 1);
    let currentIndex = 0;
    const { loadPyodide } = await import(`${RUNTIME}pyodide.mjs`);
    const python = await loadPyodide({
      indexURL: RUNTIME,
      stdout: () => {},
      stderr: () => {},
    });
    await python.loadPackage(['numpy', 'biopython', 'freesasa'], {
      checkIntegrity: true,
    });
    if (batch) {
      progress('Loading Alignment And Clustering Libraries', 0, 0);
      await python.loadPackage(['pandas', 'scikit-learn'], {
        checkIntegrity: true,
      });
    }
    python.unpackArchive(
      await asset('package.zip', engine.files['package.zip']),
      'zip',
      { extractDir: '/research' }
    );
    python.globals.set('_engine_json', JSON.stringify(engine));
    python.globals.set('_settings_json', JSON.stringify(settings));
    python.globals.set('_batch_enabled', batch);
    python.globals.set(
      '_filenames_json',
      JSON.stringify(data.files.map((file) => ({ name: file.name })))
    );
    python.globals.set(
      '_confidence_csv',
      data.confidence && batch
        ? new TextDecoder('utf-8', { fatal: true }).decode(data.confidence)
        : ''
    );
    python.registerJsModule('device_progress', {
      report: (stage, completed) =>
        progress(
          `Calculating Descriptors — ${stage}`,
          currentIndex * 6 + completed,
          data.files.length * 6,
          data.files[currentIndex].name,
          'descriptors'
        ),
    });
    await python.runPythonAsync("import sys\nsys.path.insert(0, '/research')");
    await python.runPythonAsync(
      new TextDecoder().decode(
        await asset('analysis.py', engine.files['analysis.py'])
      )
    );
    let align;
    if (batch) {
      python.unpackArchive(
        await asset('pipeline.zip', engine.files['pipeline.zip']),
        'zip',
        { extractDir: '/research' }
      );
      await python.runPythonAsync(
        new TextDecoder().decode(
          await asset('batch.py', engine.files['batch.py'])
        )
      );
      align = await alignmentRunner(
        await asset('mmalign/mmalign.mjs', engine.files['mmalign/mmalign.mjs']),
        await asset(
          'mmalign/mmalign.wasm',
          engine.files['mmalign/mmalign.wasm']
        )
      );
      for (const name of ['LICENSE.txt', 'build.json'])
        python.FS.writeFile(
          `/research/mmalign-${name}`,
          new Uint8Array(
            await asset(`mmalign/${name}`, engine.files[`mmalign/${name}`])
          )
        );
    }
    python.FS.mkdirTree('/device/inputs');
    for (let index = 0; index < data.files.length; index++) {
      currentIndex = index;
      const file = data.files[index];
      const id = `model-${String(index + 1).padStart(3, '0')}`;
      const extension = file.name.match(/\.(pdb|cif|mmcif)$/i)[1].toLowerCase();
      const entry = {
        id,
        filename: file.name,
        stored_name: `${id}.${extension}`,
      };
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
    if (batch) {
      const plan = JSON.parse(await python.runPythonAsync('alignment_plan()'));
      if (plan.tasks.length > limits.max_files ** 2)
        throw new Error('Too many pairwise alignments for this browser run.');
      const failed = new Set();
      for (const [index, task] of plan.tasks.entries()) {
        progress(
          'Aligning Comparable Structures',
          index,
          plan.tasks.length,
          `${task.a} → ${task.b}`,
          'alignment'
        );
        if (!failed.has(task.group)) {
          let stdout = '',
            error = '';
          try {
            stdout = await align(
              python.FS.readFile(`/device/artifacts/alignment/${task.a}.pdb`),
              python.FS.readFile(`/device/artifacts/alignment/${task.b}.pdb`)
            );
          } catch (problem) {
            error = String(problem);
            failed.add(task.group);
          }
          python.globals.set('_task_json', JSON.stringify(task));
          python.globals.set('_alignment_stdout', stdout);
          python.globals.set('_alignment_error', error);
          await python.runPythonAsync(
            'accept_alignment(_task_json, _alignment_stdout, _alignment_error)'
          );
        }
        progress(
          'Aligning Comparable Structures',
          index + 1,
          plan.tasks.length,
          `${task.a} → ${task.b}`,
          'alignment'
        );
      }
      for (let index = 0; index < plan.groups; index++) {
        progress(
          'Clustering And Ranking',
          index,
          plan.groups,
          `Group ${index + 1}`,
          'clustering'
        );
        python.globals.set('_group_index', index);
        await python.runPythonAsync('finish_group(_group_index)');
        progress(
          'Clustering And Ranking',
          index + 1,
          plan.groups,
          `Group ${index + 1}`,
          'clustering'
        );
      }
    }
    progress('Preparing Your Download', 0, 0, '', 'export');
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
