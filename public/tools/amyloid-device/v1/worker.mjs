// No coordinates leave this browser. Network requests load only versioned engine assets.
import { scheduleAlignments } from './alignment-scheduler.mjs';
import { monitorDiagnostics } from './diagnostics.mjs';
const BASE = new URL('./', import.meta.url);
const RUNTIME = 'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/';
let started = false;
let diagnostics;
let requestId = 0;
const requests = new Map();
function alignmentRequest(type, payload = {}, transfers = []) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    requests.set(id, { resolve, reject });
    try {
      postMessage({ type, requestId: id, ...payload }, transfers);
    } catch (error) {
      requests.delete(id);
      reject(error);
    }
  });
}
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
  diagnostics?.emit();
}
self.onmessage = async ({ data }) => {
  if (data.type === 'alignment-reply') {
    const request = requests.get(data.requestId);
    requests.delete(data.requestId);
    if (data.error) request?.reject(new Error(data.error));
    else request?.resolve(data.value);
    return;
  }
  if (data.type === 'alignment-state') {
    diagnostics?.pool(data.state);
    diagnostics?.emit();
    return;
  }
  if (started || data.type !== 'start') return;
  started = true;
  diagnostics = monitorDiagnostics(
    (message) => postMessage(message),
    BASE,
    RUNTIME
  );
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
    const workerChoice = data.alignmentWorkers ?? 'auto';
    if (!['auto', 1, 2, 4].includes(workerChoice))
      throw new Error('Invalid alignment worker count.');
    const execution = {
      requested_workers: workerChoice,
      workers: 0,
      fallback: null,
      alignment_elapsed_seconds: 0,
    };
    let currentIndex = 0;
    const { loadPyodide } = await import(`${RUNTIME}pyodide.mjs`);
    const python = await loadPyodide({
      indexURL: RUNTIME,
      stdout: () => {},
      stderr: () => {},
    });
    diagnostics.attachPython(python);
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
    let alignmentScript, alignmentBinary;
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
      alignmentScript = await asset(
        'mmalign/mmalign.mjs',
        engine.files['mmalign/mmalign.mjs']
      );
      alignmentBinary = await asset(
        'mmalign/mmalign.wasm',
        engine.files['mmalign/mmalign.wasm']
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
    diagnostics.phase('descriptors', data.files.length);
    diagnostics.emit(true);
    for (let index = 0; index < data.files.length; index++) {
      const operationStarted = performance.now();
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
      diagnostics.operation(performance.now() - operationStarted, {
        failed: model.state === 'failed',
      });
      diagnostics.emit();
      postMessage({ type: 'model', model });
    }
    if (batch) {
      const plan = JSON.parse(await python.runPythonAsync('alignment_plan()'));
      if (plan.tasks.length > limits.max_files ** 2)
        throw new Error('Too many pairwise alignments for this browser run.');
      if (plan.tasks.length) {
        progress('Preparing Alignment Workers', 0, 0, '', 'setup');
        const pool = await alignmentRequest(
          'alignment-init',
          {
            choice: workerChoice,
            tasks: plan.tasks.length,
            script: alignmentScript,
            binary: alignmentBinary,
          },
          [alignmentScript, alignmentBinary]
        );
        execution.workers = pool.workers;
        execution.fallback = pool.fallback;
        diagnostics.phase('alignment', plan.tasks.length);
        diagnostics.emit(true);
        const alignmentStarted = performance.now();
        await scheduleAlignments(
          plan.tasks,
          pool.workers,
          (task) => {
            const a = python.FS.readFile(
              `/device/artifacts/alignment/${task.a}.pdb`
            ).slice().buffer;
            const b = python.FS.readFile(
              `/device/artifacts/alignment/${task.b}.pdb`
            ).slice().buffer;
            return alignmentRequest('alignment-run', { a, b }, [a, b]);
          },
          async (task, result) => {
            python.globals.set('_task_json', JSON.stringify(task));
            python.globals.set('_alignment_stdout', result.stdout);
            python.globals.set('_alignment_error', result.error);
            return await python.runPythonAsync(
              'accept_alignment(_task_json, _alignment_stdout, _alignment_error)'
            );
          },
          (task, result, done) => {
            diagnostics.operation(result.elapsedMs, result);
            progress(
              'Aligning Comparable Structures',
              done,
              plan.tasks.length,
              `${task.a} → ${task.b}`,
              'alignment'
            );
          }
        );
        execution.alignment_elapsed_seconds =
          (performance.now() - alignmentStarted) / 1000;
        // Preserve completed-stage measurements even when the whole batch of
        // comparisons finishes within the one-second sampling interval.
        diagnostics.emit(true);
        await alignmentRequest('alignment-stop');
      }
      diagnostics.phase('clustering', plan.groups);
      diagnostics.emit(true);
      for (let index = 0; index < plan.groups; index++) {
        progress(
          'Clustering And Ranking',
          index,
          plan.groups,
          `Group ${index + 1}`,
          'clustering'
        );
        python.globals.set('_group_index', index);
        const operationStarted = performance.now();
        const group = JSON.parse(
          await python.runPythonAsync('finish_group(_group_index)')
        );
        diagnostics.operation(performance.now() - operationStarted, {
          failed: group.clustering_status === 'failed',
        });
        progress(
          'Clustering And Ranking',
          index + 1,
          plan.groups,
          `Group ${index + 1}`,
          'clustering'
        );
      }
    }
    diagnostics.phase('export');
    diagnostics.emit(true);
    progress('Preparing Your Download', 0, 0, '', 'export');
    python.globals.set('_alignment_execution_json', JSON.stringify(execution));
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
    diagnostics.emit(true);
    postMessage({ type: 'complete', result, artifacts, archive }, transfers);
  } catch (error) {
    diagnostics.emit(true);
    postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    diagnostics.stop();
  }
};
