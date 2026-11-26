// No coordinates leave this browser. Network requests load only versioned engine assets.
import { scheduleAlignments } from './alignment-scheduler.mjs';
import { scheduleDescriptors } from './descriptor-scheduler.mjs';
import { monitorDiagnostics } from './diagnostics.mjs';
import {
  openCheckpoint,
  readCheckpointSummary,
  readCheckpointCompletion,
  checkpointFailure,
} from './checkpoints.mjs';
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
    if (data.resumeId) {
      const saved = await readCheckpointSummary(data.resumeId);
      if (saved?.id !== data.resumeId)
        throw new Error('The saved run is no longer available.');
      if (saved.status === 'complete') {
        const completed = await readCheckpointCompletion(data.resumeId);
        if (!completed)
          throw new Error(
            'The saved result is missing. Delete the saved run and start again.'
          );
        if (completed.diagnostics)
          postMessage({
            type: 'diagnostics',
            diagnostics: completed.diagnostics,
          });
        postMessage({ type: 'checkpoint', summary: saved });
        postMessage(completed);
        return;
      }
    }
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
      settings.min_samples >= limits.max_files
    )
      throw new Error('Invalid clustering settings.');
    if (![5, 10, 15, 20].includes(settings.max_candidates))
      throw new Error('Choose a candidate budget of 5, 10, 15, or 20.');
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
    const recovery = {
      resumed: Boolean(data.resumeId),
      reused_descriptors: 0,
      reused_alignments: 0,
    };
    let checkpoint = null,
      checkpointWrites = true,
      lastCheckpointMessage = 0;
    let lastCheckpointFailure;
    function checkpointNotice(summary, force = false) {
      if (force || performance.now() - lastCheckpointMessage > 1000) {
        postMessage({
          type: 'checkpoint',
          summary,
          readOnly: !!checkpoint?.readOnly,
        });
        lastCheckpointMessage = performance.now();
      }
    }
    function checkpointWarning(error, stage = 'inputs') {
      checkpointWrites = false;
      lastCheckpointFailure = checkpointFailure(error, stage);
      postMessage({
        type: 'checkpoint-warning',
        failure: lastCheckpointFailure,
        message: `Saving progress stopped: ${lastCheckpointFailure.name} while saving ${stage}. ${lastCheckpointFailure.message} Calculations can continue, but only earlier saved work can be recovered.`,
      });
    }
    async function persist(store, key, output) {
      if (!checkpoint || !checkpointWrites) return false;
      try {
        const summary = await checkpoint.put(
          store,
          key,
          output,
          store === 'completion'
            ? (done, total) =>
                progress('Saving Your Results', done, total, '', 'saving')
            : undefined
        );
        checkpointNotice(summary, store === 'completion');
        return true;
      } catch (error) {
        checkpointWarning(error, store);
        return false;
      }
    }
    if (data.checkpoint || data.resumeId) {
      try {
        checkpoint = await openCheckpoint(
          {
            files: data.files,
            confidence: data.confidence ?? null,
            compare: data.compare,
            settings,
            descriptorWorkers: descriptorChoice,
            alignmentWorkers: workerChoice,
          },
          engine,
          data.resumeId,
          data.checkpointId
        );
        checkpointNotice(checkpoint.meta, true);
        if (checkpoint.readOnly) {
          checkpointWarning(checkpoint.writeFailure, 'resume metadata');
          progress('Recovering Without New Browser Writes', 0, 0);
        }
      } catch (error) {
        if (data.resumeId) throw error;
        checkpointWarning(error);
      }
    }
    const cachedDescriptors = new Array(entries.length).fill(null);
    if (checkpoint && data.resumeId) {
      progress('Restoring Saved Structures', 0, entries.length);
      for (let index = 0; index < entries.length; index++) {
        const output = await checkpoint.get('descriptors', entries[index].id);
        if (!output) continue;
        if (
          output.model.id !== entries[index].id ||
          output.model.filename !== entries[index].filename
        )
          throw new Error(
            'Saved descriptor identity does not match the input.'
          );
        cachedDescriptors[index] = output;
        data.files[index].bytes = null;
        recovery.reused_descriptors++;
      }
    }
    let descriptorOutputs = null;
    if (descriptorCount > 1) {
      descriptorOutputs = cachedDescriptors.slice();
      const pending = entries
        .map((entry, index) => ({ entry, index }))
        .filter((item) => !cachedDescriptors[item.index]);
      descriptorExecution.workers = 0;
      descriptorSteps = cachedDescriptors.map((output) => (output ? 6 : 0));
      descriptorNames = data.files.map((file) => file.name);
      diagnostics.phase('descriptors', entries.length);
      for (let index = 0; index < entries.length; index++) {
        const output = cachedDescriptors[index];
        if (!output) continue;
        diagnostics.operation(0, { skipped: true });
        descriptorExecution.structure_timings.push({
          id: entries[index].id,
          elapsed_seconds: output.elapsedMs / 1000,
        });
        postMessage({ type: 'model', model: output.model });
      }
      if (pending.length) {
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
            count: Math.min(descriptorCount, pending.length),
            config: { engine, packageBytes, analysisBytes },
          },
          [packageBytes, analysisBytes]
        );
        descriptorExecution.setup_seconds =
          (performance.now() - setupStarted) / 1000;
        descriptorExecution.workers = pool.workers;
        descriptorExecution.fallback = pool.fallback;
        diagnostics.emit(true);
        const calculationStarted = performance.now();
        try {
          await scheduleDescriptors(
            pending,
            pool.workers,
            async ({ entry, index }) => {
              const bytes = data.files[index].bytes;
              data.files[index].bytes = null;
              const output = await alignmentRequest(
                'descriptor-run',
                { entry, index, bytes },
                [bytes]
              );
              if (output.model.id !== entry.id)
                throw new Error('Descriptor result identity mismatch.');
              await persist('descriptors', entry.id, output);
              return output;
            },
            (output, pendingIndex) => {
              const index = pending[pendingIndex].index;
              descriptorOutputs[index] = output;
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
          const state = await alignmentRequest('descriptor-stop');
          descriptorExecution.peak_python_memory_bytes =
            state.peakMemoryBytes || null;
        }
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
    async function restoreDescriptor(entry, output) {
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
      return JSON.parse(await python.runPythonAsync('json.dumps(RESULTS[-1])'));
    }
    const descriptorsStarted = performance.now();
    if (descriptorOutputs) {
      const mergeStarted = performance.now();
      for (let index = 0; index < entries.length; index++) {
        const output = descriptorOutputs[index],
          entry = entries[index];
        await restoreDescriptor(entry, output);
        descriptorOutputs[index] = null;
        cachedDescriptors[index] = null;
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
        if (cachedDescriptors[index]) {
          const output = cachedDescriptors[index];
          const model = await restoreDescriptor(entries[index], output);
          cachedDescriptors[index] = null;
          descriptorExecution.structure_timings.push({
            id: entries[index].id,
            elapsed_seconds: output.elapsedMs / 1000,
          });
          diagnostics.operation(0, { skipped: true });
          progress(
            'Restoring Saved Structures',
            (index + 1) * 6,
            entries.length * 6,
            entries[index].filename,
            'descriptors'
          );
          postMessage({ type: 'model', model });
          continue;
        }
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
        if (checkpoint && checkpointWrites) {
          const paths = JSON.parse(
            await python.runPythonAsync('descriptor_paths(_entry_json)')
          );
          const output = {
            model,
            elapsedMs,
            artifacts: paths.map((path) => ({
              path,
              bytes: python.FS.readFile(`/device/artifacts/${path}`).slice()
                .buffer,
            })),
          };
          await persist('descriptors', entry.id, output);
        }
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
        const pairKey = (task) => `${task.group}:${task.a}:${task.b}`;
        const savedPairs = new Set(
          checkpoint ? await checkpoint.keys('alignments') : []
        );
        const reusedPairs = new Set();
        let checkpointReadError = null;
        const remaining = plan.tasks.filter(
          (task) => !savedPairs.has(pairKey(task))
        ).length;
        let pool = { workers: 1, fallback: null };
        if (remaining) {
          progress('Preparing Alignment Workers', 0, 0, '', 'setup');
          pool = await alignmentRequest(
            'alignment-init',
            {
              choice: workerChoice,
              tasks: remaining,
              script: alignmentScript,
              binary: alignmentBinary,
            },
            [alignmentScript, alignmentBinary]
          );
          execution.workers = pool.workers;
          execution.fallback = pool.fallback;
        }
        diagnostics.phase('alignment', plan.tasks.length);
        diagnostics.emit(true);
        const alignmentStarted = performance.now();
        await scheduleAlignments(
          plan.tasks,
          pool.workers,
          async (task) => {
            if (savedPairs.has(pairKey(task))) {
              try {
                const saved = await checkpoint.get('alignments', pairKey(task));
                if (
                  !saved ||
                  JSON.stringify(saved.task) !== JSON.stringify(task)
                )
                  throw new Error(
                    'Saved comparison identity does not match the run.'
                  );
                reusedPairs.add(pairKey(task));
                recovery.reused_alignments++;
                return saved.result;
              } catch (error) {
                checkpointReadError = error;
                throw error;
              }
            }
            const a = python.FS.readFile(
              `/device/artifacts/alignment/${task.a}.pdb`
            ).slice().buffer;
            const b = python.FS.readFile(
              `/device/artifacts/alignment/${task.b}.pdb`
            ).slice().buffer;
            return alignmentRequest('alignment-run', { a, b }, [a, b]);
          },
          async (task, result) => {
            if (checkpointReadError) throw checkpointReadError;
            python.globals.set('_task_json', JSON.stringify(task));
            python.globals.set('_alignment_stdout', result.stdout);
            python.globals.set('_alignment_error', result.error);
            const error = await python.runPythonAsync(
              'accept_alignment(_task_json, _alignment_stdout, _alignment_error)'
            );
            if (!error && !reusedPairs.has(pairKey(task)))
              await persist('alignments', pairKey(task), { task, result });
            return error;
          },
          (task, result, done) => {
            diagnostics.operation(result.elapsedMs, {
              ...result,
              skipped: result.skipped || reusedPairs.has(pairKey(task)),
            });
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
        if (remaining) await alignmentRequest('alignment-stop');
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
    python.globals.set('_recovery_json', JSON.stringify(recovery));
    let result = JSON.parse(await python.runPythonAsync('finish()'));
    progress('Writing Run Summary', 0, 0, '', 'export');
    python.FS.writeFile(
      '/research/run_report.py',
      await asset('run-report.py', engine.files['run-report.py'])
    );
    python.globals.set('_finished_result_json', JSON.stringify(result));
    result = JSON.parse(
      await python.runPythonAsync(
        "from run_report import export_run_report\nexport_run_report(ARTIFACTS, WORK / 'amyloid-device-results.zip', json.loads(_finished_result_json))"
      )
    );
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
    const completed = {
      type: 'complete',
      result,
      artifacts,
      archive,
      diagnostics: diagnostics.snapshot(),
      checkpointSaved: data.checkpoint || data.resumeId ? true : undefined,
    };
    const saved = await persist('completion', 'current', completed);
    if (data.checkpoint || data.resumeId) completed.checkpointSaved = saved;
    if (lastCheckpointFailure)
      completed.checkpointFailure = lastCheckpointFailure;
    postMessage(completed, transfers);
  } catch (error) {
    diagnostics.emit(true);
    const failure = checkpointFailure(error, 'analysis');
    postMessage({
      type: 'error',
      message: `${failure.name}: ${failure.message}`,
    });
  } finally {
    diagnostics.stop();
  }
};
