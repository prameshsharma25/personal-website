// No coordinates leave this browser. Network requests load only versioned engine assets.
import { scheduleAlignments } from './alignment-scheduler.mjs';
import { scheduleDescriptors } from './descriptor-scheduler.mjs';
import { monitorDiagnostics } from './diagnostics.mjs';
const BASE = new URL('./', import.meta.url);
const RUNTIME = 'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/';
let started = false;
let diagnostics;
let requestId = 0;
const requests = new Map();
let descriptorSteps, descriptorNames;
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
  if (data.type === 'alignment-reply' || data.type === 'descriptor-reply') {
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
  if (data.type === 'descriptor-state') {
    diagnostics?.descriptors(data.state);
    diagnostics?.emit();
    return;
  }
  if (data.type === 'descriptor-progress') {
    if (
      descriptorSteps &&
      data.index >= 0 &&
      data.index < descriptorSteps.length
    ) {
      descriptorSteps[data.index] = Math.max(
        descriptorSteps[data.index],
        Math.min(6, Math.max(0, data.completed))
      );
      progress(
        `Calculating Descriptors: ${data.stage}`,
        descriptorSteps.reduce((a, b) => a + b, 0),
        descriptorSteps.length * 6,
        descriptorNames[data.index],
        'descriptors'
      );
    }
    return;
  }
  if (started || data.type !== 'start') return;
  started = true;
  const runStarted = performance.now();
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
    const descriptorChoice = data.descriptorWorkers ?? 1;
    const descriptorCount = data.descriptorCount ?? 1;
    if (
      !['auto', 1, 2, 4].includes(descriptorChoice) ||
      !Number.isInteger(descriptorCount) ||
      descriptorCount < 1 ||
      descriptorCount > 4 ||
      descriptorCount > data.files.length
    )
      throw new Error('Invalid descriptor worker count.');
    const descriptorExecution = {
      requested_workers: descriptorChoice,
      workers: 1,
      fallback: null,
      setup_seconds: 0,
      calculation_seconds: 0,
      merge_seconds: 0,
      peak_python_memory_bytes: null,
      structure_timings: [],
    };
    const entries = data.files.map((file, index) => {
      const id = `model-${String(index + 1).padStart(3, '0')}`;
      return {
        id,
        filename: file.name,
        stored_name: `${id}.${file.name.match(/\.(pdb|cif|mmcif)$/i)[1].toLowerCase()}`,
      };
    });
    let descriptorOutputs = null;
    if (descriptorCount > 1) {
      progress('Starting Descriptor Workers', 0, 0);
      const setupStarted = performance.now();
      const packageBytes = await asset(
        'package.zip',
        engine.files['package.zip']
      );
      const analysisBytes = await asset(
        'analysis.py',
        engine.files['analysis.py']
      );
      const pool = await alignmentRequest(
        'descriptor-init',
        {
          count: descriptorCount,
          config: { engine, packageBytes, analysisBytes },
        },
        [packageBytes, analysisBytes]
      );
      descriptorExecution.setup_seconds =
        (performance.now() - setupStarted) / 1000;
      descriptorExecution.workers = pool.workers;
      descriptorExecution.fallback = pool.fallback;
      descriptorSteps = new Array(entries.length).fill(0);
      descriptorNames = data.files.map((file) => file.name);
      diagnostics.phase('descriptors', entries.length);
      diagnostics.emit(true);
      const calculationStarted = performance.now();
      try {
        descriptorOutputs = await scheduleDescriptors(
          entries,
          pool.workers,
          (entry, index) => {
            const bytes = data.files[index].bytes;
            data.files[index].bytes = null;
            return alignmentRequest('descriptor-run', { entry, index, bytes }, [
              bytes,
            ]);
          },
          (output, index) => {
            if (output.model.id !== entries[index].id)
              throw new Error('Descriptor result identity mismatch.');
            descriptorSteps[index] = 6;
            diagnostics.operation(output.elapsedMs, {
              failed: output.model.state === 'failed',
            });
            descriptorExecution.structure_timings.push({
              id: entries[index].id,
              elapsed_seconds: output.elapsedMs / 1000,
            });
            progress(
              'Calculating Descriptors',
              descriptorSteps.reduce((a, b) => a + b, 0),
              entries.length * 6,
              entries[index].filename,
              'descriptors'
            );
            postMessage({ type: 'model', model: output.model });
          }
        );
        descriptorExecution.calculation_seconds =
          (performance.now() - calculationStarted) / 1000;
        diagnostics.emit(true);
      } finally {
        // Release all descriptor runtimes before loading the coordinator runtime.
        const state = await alignmentRequest('descriptor-stop');
        descriptorExecution.peak_python_memory_bytes =
          state.peakMemoryBytes || null;
      }
      progress('Preparing Collected Results', 0, 0);
    }
    const coordinatorStarted = performance.now();
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
          `Calculating Descriptors: ${stage}`,
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
    const coordinatorSetupSeconds =
      (performance.now() - coordinatorStarted) / 1000;
    descriptorExecution.setup_seconds += coordinatorSetupSeconds;
    const descriptorsStarted = performance.now();
    if (descriptorOutputs) {
      const mergeStarted = performance.now();
      for (let index = 0; index < entries.length; index++) {
        const output = descriptorOutputs[index],
          entry = entries[index];
        for (const file of output.artifacts) {
          if (
            !file.path.startsWith(entry.id + '/') ||
            file.path.split('/').length !== 2 ||
            file.path.includes('..') ||
            file.path.includes('\\') ||
            file.path.includes('\0')
          )
            throw new Error('Invalid descriptor artifact path.');
          python.FS.mkdirTree(`/device/artifacts/${entry.id}`);
          python.FS.writeFile(
            `/device/artifacts/${file.path}`,
            new Uint8Array(file.bytes)
          );
          file.bytes = null;
        }
        python.globals.set('_entry_json', JSON.stringify(entry));
        python.globals.set('_model_json', JSON.stringify(output.model));
        await python.runPythonAsync(
          'accept_descriptor(_entry_json, _model_json)'
        );
        descriptorOutputs[index] = null;
        progress(
          'Collecting Descriptor Reports',
          index + 1,
          entries.length,
          entry.filename,
          'setup'
        );
      }
      descriptorExecution.merge_seconds =
        (performance.now() - mergeStarted) / 1000;
      descriptorOutputs = null;
    } else {
      diagnostics.phase('descriptors', data.files.length);
      diagnostics.descriptors({
        size: 1,
        active: 1,
        peakActive: 1,
        stopped: false,
        memoryBytes: 0,
        peakMemoryBytes: 0,
      });
      diagnostics.emit(true);
      for (let index = 0; index < data.files.length; index++) {
        const operationStarted = performance.now();
        currentIndex = index;
        const file = data.files[index],
          entry = entries[index];
        python.FS.writeFile(
          `/device/inputs/${entry.stored_name}`,
          new Uint8Array(file.bytes)
        );
        file.bytes = null;
        python.globals.set('_entry_json', JSON.stringify(entry));
        const model = JSON.parse(
          await python.runPythonAsync('analyze_entry(_entry_json)')
        );
        const elapsedMs = performance.now() - operationStarted;
        descriptorExecution.structure_timings.push({
          id: entry.id,
          elapsed_seconds: elapsedMs / 1000,
        });
        diagnostics.operation(elapsedMs, { failed: model.state === 'failed' });
        diagnostics.emit();
        postMessage({ type: 'model', model });
      }
      descriptorExecution.calculation_seconds =
        (performance.now() - descriptorsStarted) / 1000;
      diagnostics.emit(true);
      descriptorExecution.peak_python_memory_bytes =
        diagnostics.snapshot().peakPythonMemoryBytes;
      diagnostics.descriptors({
        size: 1,
        active: 0,
        peakActive: 1,
        stopped: true,
        memoryBytes: 0,
        peakMemoryBytes: 0,
      });
    }
    descriptorExecution.structure_timings.sort((a, b) =>
      a.id.localeCompare(b.id)
    );
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
    python.globals.set(
      '_descriptor_execution_json',
      JSON.stringify(descriptorExecution)
    );
    python.globals.set(
      '_run_elapsed_seconds',
      (performance.now() - runStarted) / 1000
    );
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
