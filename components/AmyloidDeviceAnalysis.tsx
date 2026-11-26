import { useEffect, useMemo, useRef, useState } from 'react';
import {
  inspectFiles,
  readStructure,
  titleCase,
  type Inspection,
} from '../lib/amyloid-inspector';
import {
  CANDIDATE_BUDGETS,
  DEVICE_LIMITS,
  validateDeviceFiles,
  type DeviceArtifacts,
  type DeviceMessage,
  type DeviceResult,
} from '../lib/amyloid-device';
import type { AnalysisModel } from '../lib/amyloid-jobs';
import {
  initialInspection,
  resultFilters,
} from '../lib/amyloid-result-filters';
import AnalysisProgress from './AnalysisProgress';
import { AnalysisClock } from '../lib/analysis-clock';
import SavedAnalysisRuns from './SavedAnalysisRuns';
import AnalysisDiagnostics from './AnalysisDiagnostics';
import {
  formatBytes,
  type DeviceDiagnostics,
} from '../lib/amyloid-diagnostics';
import {
  AlignmentPool,
  resolveAlignmentWorkers,
  type AlignmentWorkers,
} from '../lib/amyloid-alignment-pool';
import {
  DescriptorPool,
  resolveDescriptorWorkers,
  type DescriptorWorkers,
  type DescriptorState,
} from '../lib/amyloid-descriptor-pool';
import {
  acquireCheckpointLock,
  deleteCheckpoint,
  listCheckpoints,
  readCheckpointModels,
  readCheckpointSummary,
  setCheckpointActivity,
  saveCheckpointElapsed,
  readCheckpointInputs,
  checkpointFailure,
  retryCheckpointCompletion,
  markCheckpointFinished,
  type CheckpointFailure,
  type CheckpointSummary,
  type CheckpointInput,
} from '../lib/amyloid-checkpoints';
import styles from '../styles/Tools.module.css';

type Props = {
  active: boolean;
  onReset: () => number;
  onPreview: (
    structure: NonNullable<Inspection['structure']>,
    selection: number
  ) => void;
  onInspect: (result: Inspection, selection: number) => void;
};

function formatFailure(error: unknown) {
  const failure = checkpointFailure(error, 'recovery');
  return `${failure.name}: ${failure.message}`;
}

function completionLabel(result: DeviceResult) {
  return result.structures.every(
    (model) => model.state === 'complete' && !model.comparison_error
  ) && !result.groups?.some((group) => group.clustering_status === 'failed')
    ? 'Analysis Completed'
    : 'Completed With Errors';
}

export default function AmyloidDeviceAnalysis(props: Props) {
  const [supported, setSupported] = useState(false);
  const [saveProgress, setSaveProgress] = useState(true);
  const [checkpointAvailable, setCheckpointAvailable] = useState(false);
  const [checkpointReady, setCheckpointReady] = useState(false);
  const [savedRuns, setSavedRuns] = useState<CheckpointSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const savedRun = savedRuns.find((run) => run.id === selectedRunId) ?? null;
  const historyInitialized = useRef(false);
  const lockRun = useRef<string | null>(null);
  const readOnlyCheckpoint = useRef(false);
  const finishing = useRef<Promise<void>>(Promise.resolve());
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [checkpointMessage, setCheckpointMessage] = useState('');
  const [historyMessage, setHistoryMessage] = useState('');
  const [storageBusy, setStorageBusy] = useState(false);
  const releaseCheckpoint = useRef<(() => Promise<void>) | null>(null);
  const activeCheckpoint = useRef<string | null>(null);
  const mounted = useRef(false);
  const [ready, setReady] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [models, setModels] = useState<AnalysisModel[]>([]);
  const [result, setResult] = useState<DeviceResult | null>(null);
  const [completionSaveFailed, setCompletionSaveFailed] = useState(false);
  const [saveFailure, setSaveFailure] = useState<CheckpointFailure | null>(
    null
  );
  const [savingResults, setSavingResults] = useState(false);
  const [storageEstimate, setStorageEstimate] = useState<{
    usage: number | null;
    quota: number | null;
  } | null>(null);
  const completedRun = useRef<{
    id: string;
    attempt: string;
    diagnostics?: DeviceDiagnostics;
    hasErrors: boolean;
    resultsSaved: boolean;
  } | null>(null);
  const firstInspection = useMemo(
    () =>
      result ? initialInspection(result.structures, result.groups ?? []) : null,
    [result]
  );
  const [archive, setArchive] = useState<Blob | null>(null);
  const [previousDownload, setPreviousDownload] = useState<{
    id: string;
    blob: Blob;
  } | null>(null);
  const [opening, setOpening] = useState(false);
  const [filterKey, setFilterKey] = useState('all');
  const resultsScroll = useRef<HTMLDivElement | null>(null);
  const filters = useMemo(
    () => resultFilters(models, result?.groups ?? []),
    [models, result]
  );
  const selectedFilter =
    filters.find((filter) => filter.key === filterKey) ?? filters[0];
  const visibleModels = models.filter((model) =>
    selectedFilter.ids.has(model.id)
  );
  const representative = models.find(
    (model) => model.id === selectedFilter.representative
  );
  const [progressStep, setProgressStep] = useState<Extract<
    DeviceMessage,
    { type: 'progress' }
  > | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const clock = useRef(new AnalysisClock());
  const checkpointAttempt = useRef<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [diagnostics, setDiagnostics] = useState<DeviceDiagnostics | null>(
    null
  );
  const [diagnosticsReceivedAt, setDiagnosticsReceivedAt] = useState(0);
  const [compare, setCompare] = useState(true);
  const [confidence, setConfidence] = useState<File | null>(null);
  const [minCluster, setMinCluster] = useState(10);
  const [minSamples, setMinSamples] = useState(3);
  const [candidateBudget, setCandidateBudget] = useState(10);
  const [alignmentWorkers, setAlignmentWorkers] =
    useState<AlignmentWorkers>('auto');
  const [descriptorWorkers, setDescriptorWorkers] =
    useState<DescriptorWorkers>('auto');
  const descriptorPool = useRef<DescriptorPool | null>(null);
  const descriptorState = useRef<DescriptorState | null>(null);
  const alignmentPool = useRef<AlignmentPool | null>(null);
  const worker = useRef<Worker | null>(null);
  const epoch = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const artifacts = useRef<DeviceArtifacts>({});
  const callbacks = useRef(props);
  callbacks.current = props;

  async function measureStorage() {
    const generation = epoch.current;
    try {
      const estimate = await navigator.storage?.estimate();
      if (mounted.current && generation === epoch.current)
        setStorageEstimate({
          usage: estimate?.usage ?? null,
          quota: estimate?.quota ?? null,
        });
    } catch {
      if (mounted.current && generation === epoch.current)
        setStorageEstimate(null);
    }
  }

  async function retrySaving() {
    const completed = completedRun.current;
    if (!completed || !archive || !result || running || storageBusy) return;
    const generation = epoch.current;
    setStorageBusy(true);
    setSavingResults(true);
    setProgress('Saving Your Results');
    setProgressStep(null);
    try {
      await finishing.current;
      const payload = {
        type: 'complete',
        result,
        archive: await archive.arrayBuffer(),
        artifacts: Object.fromEntries(
          Object.entries(artifacts.current).map(([id, inputs]) => [
            id,
            inputs.map((input) => ({
              name: input.name,
              bytes:
                input.bytes.byteOffset === 0 &&
                input.bytes.byteLength === input.bytes.buffer.byteLength
                  ? input.bytes.buffer
                  : input.bytes.slice().buffer,
            })),
          ])
        ),
        diagnostics: completed.diagnostics,
        checkpointSaved: true,
      };
      await retryCheckpointCompletion(
        completed.id,
        completed.attempt,
        payload,
        clock.current.elapsedMs,
        (done: number, total: number) => {
          if (mounted.current && generation === epoch.current)
            setProgressStep({
              type: 'progress',
              stage: 'Saving Your Results',
              phase: 'saving',
              completed: done,
              total,
              filename: '',
            });
        }
      );
      if (mounted.current && generation === epoch.current) {
        if (completedRun.current) completedRun.current.resultsSaved = true;
        setCompletionSaveFailed(false);
        setSaveFailure(null);
        setCheckpointMessage('');
        setProgress(completionLabel(result));
        setProgressStep({
          type: 'progress',
          stage: 'Complete',
          phase: 'export',
          completed: 1,
          total: 1,
          filename: '',
        });
      }
    } catch (error) {
      if (mounted.current && generation === epoch.current) {
        setSaveFailure(checkpointFailure(error, 'completion'));
        setProgress(completionLabel(result));
        setProgressStep({
          type: 'progress',
          stage: 'Complete',
          phase: 'export',
          completed: 1,
          total: 1,
          filename: '',
        });
      }
    } finally {
      if (mounted.current && generation === epoch.current) {
        setSavingResults(false);
        setStorageBusy(false);
        await refreshCheckpoint();
        await measureStorage();
      }
    }
  }

  async function refreshCheckpoint() {
    try {
      const summaries = (await listCheckpoints()) as CheckpointSummary[];
      if (mounted.current) {
        const current = completedRun.current;
        setSavedRuns(
          summaries.map((run) =>
            current?.id === run.id && current.attempt === run.attempt
              ? {
                  ...run,
                  displayStatus: 'completed',
                  analysisStatus: 'completed',
                  hasErrors: current.hasErrors,
                  resultStorage: current.resultsSaved ? 'saved' : 'not_saved',
                }
              : readOnlyCheckpoint.current && lockRun.current === run.id
                ? { ...run, displayStatus: 'running', busy: true }
                : run
          )
        );
        setHistoryMessage('');
        if (!historyInitialized.current) {
          historyInitialized.current = true;
          setSelectedRunId(summaries[0]?.id ?? null);
        }
      }
    } catch (problem) {
      if (mounted.current)
        setHistoryMessage(
          problem instanceof Error
            ? problem.message
            : 'Saved runs could not be read. Your browser may have blocked local storage.'
        );
    }
  }
  async function removeCheckpoint() {
    if (!savedRun || running) return false;
    setStorageBusy(true);
    try {
      await deleteCheckpoint(savedRun.id);
      setSavedRuns((runs) => runs.filter((run) => run.id !== savedRun.id));
      setSelectedRunId(null);
      setCheckpointMessage('');
      if (activeCheckpoint.current === savedRun.id) await select([]);
      return true;
    } catch (problem) {
      setCheckpointMessage(
        problem instanceof Error
          ? problem.message
          : 'The saved run could not be deleted.'
      );
      await refreshCheckpoint();
      return false;
    } finally {
      setStorageBusy(false);
    }
  }
  function restoreInputs(input: CheckpointInput) {
    setFiles(input.files.map((file) => new File([file.bytes], file.name)));
    setConfidence(
      input.confidence
        ? new File([input.confidence], 'saved-confidence.csv', {
            type: 'text/csv',
          })
        : null
    );
    setCompare(input.compare);
    setMinCluster(input.settings.min_cluster_size);
    setMinSamples(input.settings.min_samples);
    setCandidateBudget(input.settings.max_candidates);
    setDescriptorWorkers(input.descriptorWorkers);
    setAlignmentWorkers(input.alignmentWorkers);
    setSaveProgress(true);
  }
  async function openSavedRun(run: CheckpointSummary) {
    if (running || storageBusy) return;
    if (archive && result && completedRun.current?.id === run.id) {
      setSelectedRunId(run.id);
      if (firstInspection) void inspect(firstInspection.model.id);
      return;
    }
    if (run.status === 'complete') {
      await start(run.id);
      return;
    }
    const generation = ++epoch.current;
    setStorageBusy(true);
    setError('');
    let release: (() => Promise<void>) | undefined;
    try {
      await terminate();
      release = await acquireCheckpointLock(run.id);
      const summary = (await readCheckpointSummary(
        run.id
      )) as CheckpointSummary;
      const input = (await readCheckpointInputs(run.id)) as CheckpointInput;
      const models = (await readCheckpointModels(run.id)) as AnalysisModel[];
      if (generation !== epoch.current) return;
      restoreInputs(input);
      setSelectedRunId(run.id);
      activeCheckpoint.current = run.id;
      setModels(models);
      setResult(null);
      setArchive(null);
      setPreviousDownload(null);
      setCompletionSaveFailed(false);
      setSaveFailure(null);
      completedRun.current = null;
      setFilterKey('all');
      setDiagnostics(null);
      setProgressStep(null);
      setStartedAt(0);
      clock.current.restore(summary.elapsedMs);
      setElapsedMs(clock.current.elapsedMs);
      setProgress(
        summary.analysisStatus === 'completed'
          ? 'Analysis Completed'
          : run.displayStatus === 'failed'
            ? 'Stopped. Saved Progress Is Ready To Resume.'
            : 'Paused. Saved Progress Is Ready To Resume.'
      );
      artifacts.current = {};
      callbacks.current.onReset();
    } catch (problem) {
      if (generation === epoch.current) setError(formatFailure(problem));
    } finally {
      await release?.();
      if (generation === epoch.current) setStorageBusy(false);
    }
  }
  async function clearLocalResults() {
    if (
      savedRun?.id === activeCheckpoint.current &&
      !(await removeCheckpoint())
    )
      return;
    await select([]);
  }
  function invalidate() {
    return ++epoch.current;
  }
  function terminate(
    activity?: 'paused' | 'failed',
    message = '',
    completion?: { hasErrors: boolean; saveError: string }
  ) {
    const elapsed = clock.current.running ? clock.current.stop() : undefined;
    if (elapsed !== undefined && mounted.current) setElapsedMs(elapsed);
    descriptorPool.current?.dispose();
    descriptorPool.current = null;
    alignmentPool.current?.dispose();
    alignmentPool.current = null;
    worker.current?.terminate();
    worker.current = null;
    const release = releaseCheckpoint.current;
    const id = lockRun.current;
    const attempt = checkpointAttempt.current;
    const readOnly = readOnlyCheckpoint.current;
    readOnlyCheckpoint.current = false;
    releaseCheckpoint.current = null;
    lockRun.current = null;
    checkpointAttempt.current = null;
    if (release) {
      finishing.current = (async () => {
        try {
          if (readOnly) {
            if (mounted.current)
              setCheckpointMessage(
                'Recovery used saved checkpoints without writing new progress. Download the results before leaving this page.'
              );
          } else if (id && completion && attempt)
            await markCheckpointFinished(id, attempt, completion, elapsed);
          else if (id && activity)
            await setCheckpointActivity(id, activity, message, elapsed);
        } catch {
          if (mounted.current)
            setCheckpointMessage(
              completion
                ? 'Analysis completed. Its history status could not be saved in this browser. Download the results before leaving.'
                : 'The run stopped, but its status could not be saved. Earlier checkpoints remain available.'
            );
        } finally {
          await release();
        }
      })();
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    return finishing.current;
  }
  async function handleDescriptorRequest(
    data: Extract<
      DeviceMessage,
      { type: 'descriptor-init' | 'descriptor-run' | 'descriptor-stop' }
    >,
    engine: Worker,
    generation: number
  ) {
    try {
      let value: unknown;
      let transfers: Transferable[] = [];
      if (data.type === 'descriptor-init') {
        descriptorPool.current?.dispose();
        const pool = new DescriptorPool(data.config, {
          onState: (state) => {
            descriptorState.current = state;
            if (generation === epoch.current)
              engine.postMessage({ type: 'descriptor-state', state });
          },
          onProgress: (index, stage, completed) => {
            if (generation === epoch.current)
              engine.postMessage({
                type: 'descriptor-progress',
                index,
                stage,
                completed,
              });
          },
        });
        descriptorPool.current = pool;
        value = await pool.initialize(data.count);
      } else if (data.type === 'descriptor-run') {
        if (!descriptorPool.current)
          throw new Error('The descriptor workers are unavailable.');
        const output = await descriptorPool.current.run(
          data.entry,
          data.bytes,
          data.index
        );
        value = output;
        transfers = output.artifacts.map((file) => file.bytes);
      } else {
        descriptorPool.current?.dispose();
        descriptorPool.current = null;
        value = descriptorState.current;
      }
      if (generation === epoch.current)
        engine.postMessage(
          { type: 'descriptor-reply', requestId: data.requestId, value },
          transfers
        );
    } catch (error) {
      if (generation === epoch.current)
        engine.postMessage({
          type: 'descriptor-reply',
          requestId: data.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }
  async function handleAlignmentRequest(
    data: Extract<
      DeviceMessage,
      { type: 'alignment-init' | 'alignment-run' | 'alignment-stop' }
    >,
    engine: Worker,
    generation: number
  ) {
    try {
      let value: unknown;
      if (data.type === 'alignment-init') {
        alignmentPool.current?.dispose();
        const pool = new AlignmentPool(data.script, data.binary, {
          onState: (state) => {
            if (generation === epoch.current)
              engine.postMessage({ type: 'alignment-state', state });
          },
        });
        alignmentPool.current = pool;
        value = await pool.initialize(
          resolveAlignmentWorkers(
            data.choice,
            navigator.hardwareConcurrency,
            data.tasks
          )
        );
      } else if (data.type === 'alignment-run') {
        if (!alignmentPool.current)
          throw new Error('The alignment workers are unavailable.');
        value = await alignmentPool.current.run(data.a, data.b);
      } else {
        alignmentPool.current?.dispose();
        alignmentPool.current = null;
        value = null;
      }
      if (generation === epoch.current)
        engine.postMessage({
          type: 'alignment-reply',
          requestId: data.requestId,
          value,
        });
    } catch (error) {
      if (generation === epoch.current)
        engine.postMessage({
          type: 'alignment-reply',
          requestId: data.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }
  useEffect(() => {
    mounted.current = true;
    const canSave = typeof indexedDB !== 'undefined' && !!navigator.locks;
    setCheckpointAvailable(canSave);
    if (!canSave) setSaveProgress(false);
    if (canSave)
      void refreshCheckpoint().finally(() => {
        if (mounted.current) setCheckpointReady(true);
      });
    else setCheckpointReady(true);
    const refresh = () => {
      if (canSave && document.visibilityState === 'visible')
        void refreshCheckpoint();
    };
    const historyTimer = canSave ? setInterval(refresh, 2000) : null;
    window.addEventListener('focus', refresh);
    setReady(true);
    setSupported(
      typeof Worker !== 'undefined' &&
        typeof WebAssembly !== 'undefined' &&
        !!globalThis.crypto?.subtle
    );
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', refresh);
      if (historyTimer) clearInterval(historyTimer);
      invalidate();
      void terminate('paused');
    };
  }, []);
  useEffect(() => {
    if (!running && !savingResults) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running, savingResults]);

  useEffect(() => {
    if (completionSaveFailed) void measureStorage();
  }, [completionSaveFailed]);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (!clock.current.running) return;
      const elapsed = clock.current.elapsedMs;
      setElapsedMs(elapsed);
      const id = lockRun.current;
      const attempt = checkpointAttempt.current;
      const generation = epoch.current;
      if (id && attempt && !readOnlyCheckpoint.current)
        void saveCheckpointElapsed(id, attempt, elapsed).catch(() => {
          if (mounted.current && generation === epoch.current)
            setCheckpointMessage(
              'Elapsed time could not be saved. Earlier checkpoints remain available.'
            );
        });
    };
    const interval = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [running]);

  async function inspect(id: string) {
    const generation = epoch.current;
    const selection = callbacks.current.onReset();
    setOpening(true);
    try {
      const inspection = await inspectFiles(artifacts.current[id]);
      if (generation === epoch.current && callbacks.current.active)
        callbacks.current.onInspect(inspection, selection);
    } catch (problem) {
      if (generation === epoch.current)
        setError(
          problem instanceof Error
            ? problem.message
            : 'The report could not be opened.'
        );
    } finally {
      if (generation === epoch.current) setOpening(false);
    }
  }
  async function select(selected: File[]) {
    const generation = ++epoch.current;
    await terminate();
    if (generation !== epoch.current) return;
    setSelectedRunId(null);
    if (!selected.length && fileInput.current) fileInput.current.value = '';
    artifacts.current = {};
    setError('');
    setProgress('');
    setProgressStep(null);
    setStartedAt(0);
    clock.current.restore();
    setElapsedMs(null);
    setDiagnostics(null);
    setDiagnosticsReceivedAt(0);
    setConfidence(null);
    setResult(null);
    setFilterKey('all');
    setCompletionSaveFailed(false);
    setSaveFailure(null);
    completedRun.current = null;
    setArchive(null);
    setPreviousDownload(null);
    setModels([]);
    setOpening(false);
    setFiles([]);
    activeCheckpoint.current = null;
    const selection = callbacks.current.onReset();
    if (!selected.length) return;
    try {
      validateDeviceFiles(selected);
      setFiles(selected);
      if (selected.length === 1) {
        const preview = await readStructure({
          name: selected[0].name,
          bytes: new Uint8Array(await selected[0].arrayBuffer()),
        });
        if (generation === epoch.current && callbacks.current.active)
          callbacks.current.onPreview(preview, selection);
      }
    } catch (problem) {
      if (generation === epoch.current) {
        setFiles([]);
        setError(
          problem instanceof Error
            ? problem.message
            : 'The files could not be read.'
        );
      }
    }
  }
  function fail(message: string) {
    const stopped = terminate('failed', message);
    ++epoch.current;
    setRunning(false);
    setOpening(false);
    setModels([]);
    artifacts.current = {};
    setProgress('Analysis Stopped');
    setError(message);
    if (checkpointAvailable) void stopped.then(refreshCheckpoint);
  }
  function watchdog(milliseconds: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () =>
        fail(
          'This calculation took too long on your device and was stopped. Try a smaller assembly or use the full pipeline on a local Python installation.'
        ),
      milliseconds
    );
  }
  async function start(resumeId?: string) {
    setPreviousDownload((previous) =>
      resumeId
        ? archive && completedRun.current?.id === resumeId
          ? { id: resumeId, blob: archive }
          : previous?.id === resumeId
            ? previous
            : null
        : null
    );
    const generation = ++epoch.current;
    setRunning(true);
    await terminate();
    if (generation !== epoch.current) return;
    setSelectedRunId(resumeId ?? null);
    setError('');
    setResult(null);
    setFilterKey('all');
    setCompletionSaveFailed(false);
    setSaveFailure(null);
    completedRun.current = null;
    setArchive(null);
    setModels([]);
    setOpening(false);
    artifacts.current = {};
    setRunning(true);
    setStartedAt(Date.now());
    clock.current.restore(
      resumeId ? savedRuns.find((run) => run.id === resumeId)?.elapsedMs : 0
    );
    if (!resumeId) clock.current.start();
    setElapsedMs(clock.current.elapsedMs);
    setDiagnostics(null);
    setDiagnosticsReceivedAt(0);
    setProgressStep(null);
    setProgress(
      resumeId ? 'Opening Saved Progress' : 'Reading Your Structures'
    );
    setCheckpointMessage('');
    activeCheckpoint.current = resumeId || null;
    callbacks.current.onReset();
    try {
      const checkpoint = Boolean(
        resumeId || (saveProgress && checkpointAvailable)
      );
      const checkpointId = checkpoint
        ? resumeId || crypto.randomUUID()
        : undefined;
      if (checkpointId) {
        const release = (await acquireCheckpointLock(
          checkpointId
        )) as () => Promise<void>;
        if (generation !== epoch.current) {
          release();
          return;
        }
        releaseCheckpoint.current = release;
        lockRun.current = checkpointId;
      }
      let input: CheckpointInput;
      let reopened: CheckpointSummary | null = null;
      if (resumeId) {
        reopened = (await readCheckpointSummary(resumeId)) as CheckpointSummary;
        if (generation !== epoch.current) return;
        clock.current.restore(reopened?.elapsedMs);
        if (reopened?.status !== 'complete') clock.current.start();
        setElapsedMs(clock.current.elapsedMs);
        input = (await readCheckpointInputs(resumeId)) as CheckpointInput;
        if (generation !== epoch.current) return;
        restoreInputs(input);
      } else {
        validateDeviceFiles(files);
        if (!CANDIDATE_BUDGETS.includes(candidateBudget))
          throw new Error('Choose a candidate budget of 5, 10, 15, or 20.');
        if (confidence && confidence.size > 65536)
          throw new Error('Confidence CSV must be at most 64 KB.');
        if (
          !Number.isInteger(minCluster) ||
          minCluster < 2 ||
          minCluster > DEVICE_LIMITS.files ||
          !Number.isInteger(minSamples) ||
          minSamples < 1 ||
          minSamples >= DEVICE_LIMITS.files
        )
          throw new Error(
            `Use a minimum cluster size of 2 to ${DEVICE_LIMITS.files} and minimum samples of 1 to ${DEVICE_LIMITS.files - 1}.`
          );
        const confidenceBytes =
          confidence && compare && files.length > 1
            ? await confidence.arrayBuffer()
            : null;
        const selected = await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            bytes: await file.arrayBuffer(),
          }))
        );
        input = {
          files: selected,
          confidence: confidenceBytes,
          compare,
          descriptorWorkers,
          alignmentWorkers,
          settings: {
            min_cluster_size: minCluster,
            min_samples: minSamples,
            max_candidates: candidateBudget,
          },
        };
      }
      if (generation !== epoch.current) return;
      const engine = new Worker('/tools/amyloid-device/v1/worker.mjs', {
        type: 'module',
        name: 'amyloid-on-device',
      });
      worker.current = engine;
      engine.onerror = (event) => {
        event.preventDefault();
        if (generation === epoch.current)
          fail(
            'The browser could not start the analysis engine. Check your connection, try an up-to-date desktop browser, and run again.'
          );
      };
      engine.onmessageerror = () => {
        if (generation === epoch.current)
          fail(
            'The browser could not read the analysis result. Try again with fewer structures.'
          );
      };
      engine.onmessage = ({ data }: MessageEvent<DeviceMessage>) => {
        if (generation !== epoch.current) return;
        if (
          data.type === 'descriptor-init' ||
          data.type === 'descriptor-run' ||
          data.type === 'descriptor-stop'
        ) {
          void handleDescriptorRequest(data, engine, generation);
        } else if (
          data.type === 'alignment-init' ||
          data.type === 'alignment-run' ||
          data.type === 'alignment-stop'
        ) {
          void handleAlignmentRequest(data, engine, generation);
        } else if (data.type === 'checkpoint') {
          readOnlyCheckpoint.current = !!data.readOnly;
          checkpointAttempt.current = data.summary.attempt ?? null;
          setSavedRuns((runs) =>
            [
              {
                ...data.summary,
                displayStatus:
                  data.summary.status === 'complete' ? 'completed' : 'running',
                busy: true,
              } satisfies CheckpointSummary,
              ...runs.filter((run) => run.id !== data.summary.id),
            ].sort(
              (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)
            )
          );
          setSelectedRunId(data.summary.id);
          activeCheckpoint.current = data.summary.id;
        } else if (data.type === 'checkpoint-warning') {
          setCheckpointMessage(data.message);
          if (data.failure) setSaveFailure(data.failure);
        } else if (data.type === 'diagnostics') {
          setDiagnostics(data.diagnostics);
          setDiagnosticsReceivedAt(performance.now());
        } else if (data.type === 'progress') {
          setProgress(data.stage);
          setProgressStep(data);
          watchdog(
            data.phase === 'setup'
              ? 180000
              : data.phase === 'alignment'
                ? 180000
                : 300000
          );
        } else if (data.type === 'model') {
          setModels((current) =>
            [...current, data.model].sort((a, b) => a.id.localeCompare(b.id))
          );
        } else if (data.type === 'error') {
          fail(data.message);
        } else if (data.type === 'complete') {
          // Older completed runs predate cumulative timing. Their report keeps
          // the measured duration of the last attempt; never time reopening it.
          if (reopened?.status === 'complete' && reopened.elapsedMs == null) {
            clock.current.restore(data.result.elapsed_seconds * 1000);
            setElapsedMs(clock.current.elapsedMs);
          }
          const saveFailed = data.checkpointSaved === false;
          setCompletionSaveFailed(saveFailed);
          if (data.checkpointFailure) setSaveFailure(data.checkpointFailure);
          completedRun.current =
            lockRun.current && checkpointAttempt.current
              ? {
                  id: lockRun.current,
                  attempt: checkpointAttempt.current,
                  diagnostics: data.diagnostics,
                  hasErrors:
                    completionLabel(data.result) === 'Completed With Errors',
                  resultsSaved: !saveFailed,
                }
              : null;
          const stopped = terminate(undefined, '', {
            hasErrors: completionLabel(data.result) === 'Completed With Errors',
            saveError: saveFailed
              ? data.checkpointFailure
                ? `${data.checkpointFailure.name} while saving ${data.checkpointFailure.stage}: ${data.checkpointFailure.message}`
                : 'The browser copy could not be saved. Results remain available to download.'
              : '',
          });
          setCheckpointMessage('');
          if (checkpointAvailable) void stopped.then(refreshCheckpoint);
          setRunning(false);
          setResult(data.result);
          setModels(data.result.structures);
          setProgressStep({
            type: 'progress',
            stage: 'Complete',
            phase: 'export',
            completed: 1,
            total: 1,
            filename: '',
          });
          setProgress(completionLabel(data.result));
          setArchive(new Blob([data.archive], { type: 'application/zip' }));
          setPreviousDownload(null);
          artifacts.current = Object.fromEntries(
            Object.entries(data.artifacts).map(([id, inputs]) => [
              id,
              inputs.map((input) => ({
                name: input.name,
                bytes: new Uint8Array(input.bytes),
              })),
            ])
          );
          const first = initialInspection(
            data.result.structures,
            data.result.groups ?? []
          );
          if (first && callbacks.current.active) void inspect(first.model.id);
        }
      };
      watchdog(180000);
      engine.postMessage(
        {
          type: 'start',
          ...input,
          checkpoint,
          checkpointId,
          resumeId,
          descriptorCount: resolveDescriptorWorkers(
            input.descriptorWorkers,
            navigator.hardwareConcurrency,
            input.files.length,
            (navigator as Navigator & { deviceMemory?: number }).deviceMemory
          ),
        },
        [
          ...input.files.map((file) => file.bytes),
          ...(input.confidence ? [input.confidence] : []),
        ]
      );
    } catch (problem) {
      if (generation === epoch.current) fail(formatFailure(problem));
    }
  }
  function cancel() {
    ++epoch.current;
    const stopped = terminate('paused');
    setRunning(false);
    setOpening(false);
    setModels([]);
    setResult(null);
    setFilterKey('all');
    setArchive(null);
    setError('');
    artifacts.current = {};
    setProgress(
      activeCheckpoint.current
        ? 'Paused. Saved Progress Is Ready To Resume.'
        : 'Cancelled. No Files Were Uploaded.'
    );
    if (checkpointAvailable) void stopped.then(refreshCheckpoint);
    callbacks.current.onReset();
  }
  function download() {
    if (archive) downloadBlob(archive);
  }
  function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'amyloid-device-results.zip';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section aria-label="On-Device Analysis">
      {checkpointAvailable && (
        <SavedAnalysisRuns
          runs={savedRuns}
          selectedId={selectedRunId}
          busy={running || storageBusy}
          onOpen={(run) => void openSavedRun(run)}
          onNew={() => void select([])}
        />
      )}
      {savedRun && (
        <section className={styles.recoveryPanel} aria-label="Saved Analysis">
          <p className={styles.kicker}>Selected Run</p>
          <h3>{savedRun.name}</h3>
          <p>
            {savedRun.inputCount} Structures · {savedRun.descriptors} Saved
            Assessments · {savedRun.alignments} Saved Comparisons
          </p>
          <p className={styles.caption}>
            Last saved {new Date(savedRun.updatedAt).toLocaleString()}. Saved
            assessments and comparisons are reused. An interrupted calculation
            runs again.
          </p>
          {savedRun.analysisStatus === 'completed' &&
            savedRun.status !== 'complete' && (
              <p className={styles.caption}>
                Analysis completed. The final browser copy was not saved.
                {archive && completedRun.current?.id === savedRun.id
                  ? ' Your results are ready to download below.'
                  : ' Rebuild the download from the saved checkpoints to access results again.'}
              </p>
            )}
          {savedRun.saveError && (
            <details>
              <summary>Browser Storage Details</summary>
              <p>{savedRun.saveError}</p>
            </details>
          )}
          {savedRun.error && (
            <p className={styles.caption}>Last Run Error: {savedRun.error}</p>
          )}
          <div className={styles.controls}>
            <button
              disabled={
                running ||
                storageBusy ||
                !checkpointAvailable ||
                !!savedRun.busy
              }
              onClick={() =>
                archive && completedRun.current?.id === savedRun.id
                  ? void openSavedRun(savedRun)
                  : void start(savedRun.id)
              }
            >
              {archive && completedRun.current?.id === savedRun.id
                ? 'View Current Results'
                : savedRun.status === 'complete'
                  ? 'Open Saved Results'
                  : savedRun.analysisStatus === 'completed'
                    ? 'Rebuild Download From Checkpoints'
                    : 'Resume Saved Run'}
            </button>
            {archive &&
              completedRun.current?.id === savedRun.id &&
              savedRun.status !== 'complete' && (
                <button
                  disabled={running || storageBusy || !!savedRun.busy}
                  onClick={() => void start(savedRun.id)}
                >
                  Rebuild Download From Checkpoints
                </button>
              )}
            <button
              disabled={running || storageBusy || !!savedRun.busy}
              onClick={() => void removeCheckpoint()}
            >
              Delete Saved Run
            </button>
          </div>
          {savedRun.busy && !running && (
            <p className={styles.caption}>
              This run is open in another tab. Pause it or close that tab before
              opening it here.
            </p>
          )}
        </section>
      )}
      <div className={styles.upload}>
        <div>
          <p className={styles.kicker}>01 / Your Structures. Your Device.</p>
          <h2>Bring The Calculation To Your Computer.</h2>
          <p>
            Calculate geometry, packing, energy descriptors, and amyloid
            warnings from your PDB or mmCIF files. Your structures stay on your
            device.
          </p>
        </div>
        <div className={styles.uploadActions}>
          <label htmlFor="amyloid-device-files">Choose Structures</label>
          <input
            ref={fileInput}
            id="amyloid-device-files"
            aria-describedby="amyloid-device-file-help"
            type="file"
            multiple
            accept=".pdb,.cif,.mmcif"
            disabled={!ready || running || storageBusy}
            onChange={(event) => {
              void select(Array.from(event.target.files || []));
              event.target.value = '';
            }}
          />
          <p id="amyloid-device-file-help">
            Up to {DEVICE_LIMITS.files} files ·{' '}
            {DEVICE_LIMITS.fileBytes / 1024 ** 2} MB each ·{' '}
            {DEVICE_LIMITS.totalBytes / 1024 ** 2} MB total
          </p>
          {!!files.length && (
            <details>
              <summary>
                {files.length} {files.length === 1 ? 'Structure' : 'Structures'}{' '}
                Selected ·{' '}
                {(
                  files.reduce((sum, file) => sum + file.size, 0) /
                  1024 ** 2
                ).toFixed(1)}{' '}
                MB
              </summary>
              <p>{files.map((file) => file.name).join(', ')}</p>
            </details>
          )}
        </div>
      </div>
      {files.length > 1 && (
        <details className={styles.batchSettings} open>
          <summary>Batch Analysis Settings</summary>
          <div className={styles.analysisSettings}>
            <div className={styles.settingField}>
              <label>
                Descriptor Workers
                <select
                  value={descriptorWorkers}
                  disabled={running || storageBusy}
                  onChange={(event) =>
                    setDescriptorWorkers(
                      event.target.value === 'auto'
                        ? 'auto'
                        : (Number(event.target.value) as 1 | 2 | 4)
                    )
                  }
                >
                  <option value="auto">Auto (Up To 2)</option>
                  <option value="1">1 Worker</option>
                  <option value="2">2 Workers</option>
                  <option value="4">4 Workers</option>
                </select>
              </label>
              <p>
                Calculate geometry, packing, energetics, and warnings for
                different structures at the same time. Each worker loads its own
                Python engine and uses additional memory. Auto uses one worker
                for fewer than four structures or devices reporting 4 GB of
                memory or less. Descriptor workers finish before alignment
                begins.
              </p>
            </div>
            <label className={styles.compareToggle}>
              <input
                type="checkbox"
                checked={compare}
                disabled={running || storageBusy}
                onChange={(event) => setCompare(event.target.checked)}
              />{' '}
              Compare And Cluster Structures
            </label>
            {compare && (
              <>
                <div className={styles.comparisonHelp}>
                  <p>
                    MM-align compares matching sequences and chain counts.
                    HDBSCAN groups similar assemblies; representative structures
                    and shortlist eligibility appear in your results and
                    download.
                  </p>
                  <p aria-label="Comparison Workload">
                    Up to {(files.length ** 2).toLocaleString('en-US')} MM-align
                    runs for {files.length} structures, including self-checks
                    and both comparison directions. Different sequences or chain
                    counts are grouped separately, reducing the work. Larger
                    batches can take a long time; keep this tab open. Turn off
                    comparisons to calculate individual reports only.
                  </p>
                </div>
                <div className={styles.settingField}>
                  <label>
                    Parallel Workers
                    <select
                      value={alignmentWorkers}
                      disabled={running || storageBusy}
                      onChange={(event) =>
                        setAlignmentWorkers(
                          event.target.value === 'auto'
                            ? 'auto'
                            : (Number(event.target.value) as 1 | 2 | 4)
                        )
                      }
                    >
                      <option value="auto">Auto (Up To 2)</option>
                      <option value="1">1 Worker</option>
                      <option value="2">2 Workers</option>
                      <option value="4">4 Workers</option>
                    </select>
                  </label>
                  <p>
                    MM-align comparisons share a queue across the selected
                    workers. Auto leaves processor headroom and uses at most
                    two. Counts are capped by the processors reported by your
                    browser. More workers use more memory. This setting controls
                    comparisons; Descriptor Workers controls individual
                    structure calculations.
                  </p>
                </div>
                <div className={styles.settingField}>
                  <div className={styles.settingPair}>
                    <label>
                      Minimum Cluster Size
                      <input
                        type="number"
                        min="2"
                        max={DEVICE_LIMITS.files}
                        value={minCluster}
                        disabled={running || storageBusy}
                        onChange={(event) =>
                          setMinCluster(Number(event.target.value))
                        }
                      />
                    </label>
                    <label>
                      Minimum Samples
                      <input
                        type="number"
                        min="1"
                        max={DEVICE_LIMITS.files - 1}
                        value={minSamples}
                        disabled={running || storageBusy}
                        onChange={(event) =>
                          setMinSamples(Number(event.target.value))
                        }
                      />
                    </label>
                  </div>
                  <p>
                    Minimum Samples counts neighboring structures, excluding the
                    structure itself. Small pools may not support clusters.
                    Missing prediction confidence remains unavailable. The
                    diversity filter keeps shortlisted candidates at least 0.20
                    apart on the structural distance scale. Shortlisting
                    requires prediction confidence, including ipTM and mean
                    pLDDT; clustering does not.
                  </p>
                </div>
                <div className={styles.settingField}>
                  <label>
                    Candidate Budget
                    <select
                      value={candidateBudget}
                      aria-describedby="amyloid-candidate-budget-help"
                      disabled={running || storageBusy}
                      onChange={(event) =>
                        setCandidateBudget(Number(event.target.value))
                      }
                    >
                      {CANDIDATE_BUDGETS.map((budget) => (
                        <option key={budget} value={budget}>
                          {budget} Candidates
                        </option>
                      ))}
                    </select>
                  </label>
                  <p id="amyloid-candidate-budget-help">
                    Maximum shortlisted candidates per comparable group. All
                    uploaded structures are analyzed. Fewer candidates may
                    qualify under the same evidence and diversity rules. Saved
                    runs retain their original budget.
                  </p>
                </div>
                <div className={styles.settingField}>
                  <label>
                    Optional Confidence CSV
                    <input
                      type="file"
                      accept=".csv"
                      aria-describedby="amyloid-device-confidence-help"
                      disabled={running || storageBusy}
                      onChange={(event) =>
                        setConfidence(event.target.files?.[0] || null)
                      }
                    />
                  </label>
                  <p id="amyloid-device-confidence-help">
                    Up to 64 KB. Match the exact structure filenames.{' '}
                    <a href="/tools/confidence-template.csv" download>
                      Download A Template
                    </a>
                  </p>
                </div>
              </>
            )}
          </div>
        </details>
      )}
      <div className={styles.recoveryOption}>
        <label>
          <input
            type="checkbox"
            checked={saveProgress}
            disabled={
              running || storageBusy || !checkpointAvailable || !checkpointReady
            }
            onChange={(event) => setSaveProgress(event.target.checked)}
          />{' '}
          Save Progress On This Device
        </label>
        <p>
          Keep inputs, completed calculations, and results in this browser so
          you can resume after a refresh or interruption. Nothing is uploaded.
          Pausing keeps saved progress. Each run is saved separately in your run
          history. Delete Saved Run removes only the selected run.
        </p>
        <p>
          Recovery needs this browser on this device and the same analysis
          engine. Clearing site data, private browsing, or browser storage
          cleanup can remove checkpoints. Download your final reports.
        </p>
        {ready && !checkpointAvailable && (
          <p>
            Checkpoints are unavailable in this browser. Calculations can still
            run with this option off.
          </p>
        )}
      </div>
      {(checkpointMessage || historyMessage) && (
        <p className={styles.notice} aria-live="polite">
          {checkpointMessage || historyMessage}
        </p>
      )}
      <div className={styles.exampleBar}>
        <button
          className={styles.runButton}
          disabled={
            !supported ||
            !files.length ||
            running ||
            storageBusy ||
            !checkpointReady
          }
          onClick={() => void start()}
        >
          Analyze On My Device
        </button>
        {running && (
          <button onClick={cancel}>
            {activeCheckpoint.current ? 'Pause Analysis' : 'Cancel Analysis'}
          </button>
        )}
        {!!(archive || models.length) && !running && (
          <button
            disabled={storageBusy}
            onClick={() => void clearLocalResults()}
          >
            Clear Local Results
          </button>
        )}
      </div>
      {previousDownload && (
        <div
          className={styles.notice}
          role="region"
          aria-label="Previous Download"
        >
          <p>
            Your earlier ZIP remains available while this download is rebuilt,
            including if recovery stops.
          </p>
          <div className={styles.controls}>
            <button onClick={() => downloadBlob(previousDownload.blob)}>
              Download Previous Results
            </button>
          </div>
        </div>
      )}
      <p className={styles.caption}>
        The first run downloads the analysis engine from jsDelivr. Calculations
        use your device’s CPU and memory in a background worker. Keep this page
        open and download your results before leaving. Larger assemblies work
        best on a desktop. With Save Progress On This Device enabled, completed
        structures and comparisons are saved for recovery. With it off, closing
        or refreshing the page discards the run.
      </p>
      <p className={styles.notice}>
        Calculations use the first model, up to 20,000 atoms and 32 polymer
        chains per structure. Batch comparisons also run on your device.
        Clustering uses scikit-learn HDBSCAN; its implementation is recorded in
        each report.
      </p>
      {ready && !supported && (
        <p className={styles.error} role="alert">
          On-device analysis needs WebAssembly, Web Workers, and a secure
          connection. Try an up-to-date browser. Hosted Server Analysis is
          planned for a future release.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {progress && (
        <AnalysisProgress
          label={progress}
          running={running || savingResults}
          elapsedMs={elapsedMs}
          completed={progressStep?.completed}
          total={progressStep?.total}
          filename={progressStep?.filename}
          phase={progressStep?.phase}
        />
      )}
      {result && completionSaveFailed && (
        <div
          className={styles.storageNotice}
          role="region"
          aria-label="Browser Storage"
        >
          <h3>Analysis Completed. Browser Copy Not Saved.</h3>
          <p>
            Your results are ready to download. Browser storage could not keep a
            copy, so download the ZIP before leaving this page.
          </p>
          <details>
            <summary>Save Details</summary>
            {saveFailure && (
              <p>
                <strong>{saveFailure.name}</strong> while saving{' '}
                {saveFailure.stage}: {saveFailure.message}
              </p>
            )}
            {storageEstimate && (
              <p>
                Estimated Storage For This Site:{' '}
                {formatBytes(storageEstimate.usage)} Used Of{' '}
                {formatBytes(storageEstimate.quota)} Allowed. Browser limits and
                available disk space can still prevent saving.
              </p>
            )}
          </details>
          <div className={styles.controls}>
            <button onClick={download}>Download Results ZIP</button>
          </div>
          {completedRun.current ? (
            <>
              <p>
                Retry saving the finished results without repeating
                calculations. Saved assessments and comparisons are retained.
              </p>
              <div className={styles.controls}>
                <button
                  onClick={() => void retrySaving()}
                  disabled={storageBusy}
                >
                  {savingResults ? 'Saving Results' : 'Retry Saving Results'}
                </button>
              </div>
            </>
          ) : (
            <p>
              Resume Saved Run reuses saved assessments and comparisons to
              rebuild the final results.
            </p>
          )}
        </div>
      )}
      {!!startedAt && (
        <AnalysisDiagnostics
          key={startedAt}
          data={diagnostics}
          receivedAt={diagnosticsReceivedAt}
          running={running}
          inputCount={files.length}
          inputBytes={files.reduce((sum, file) => sum + file.size, 0)}
        />
      )}
      {!!models.length && (
        <div className={styles.jobPanel}>
          <div className={styles.resultHeading}>
            <div>
              <p className={styles.kicker}>On-Device Results</p>
              <h2>
                {result
                  ? 'Your Structure Assessments'
                  : running
                    ? 'Calculating Your Structures'
                    : 'Saved Structure Assessments'}
              </h2>
            </div>
            {archive && (
              <div className={styles.controls}>
                <button onClick={download}>Download Local Reports</button>
              </div>
            )}
          </div>
          {firstInspection && (
            <section
              className={styles.clusterRepresentative}
              aria-label="Initial Structure Selection"
            >
              <div>
                <p className={styles.kicker}>
                  {firstInspection.shortlisted
                    ? 'First Shortlisted Candidate'
                    : 'First Calculated Structure'}
                </p>
                <strong>{firstInspection.model.filename}</strong>
                <p>
                  {firstInspection.shortlisted
                    ? `Group ${firstInspection.groupIndex! + 1} · Shortlist #${firstInspection.rank}. Selected by ranking and diversity within this group. Groups are ranked separately.`
                    : result?.groups?.length
                      ? 'No shortlisted candidate is available to inspect. The viewer opens the first calculated structure. Check the selection reasons below.'
                      : 'The viewer opens the first calculated structure. No diversity shortlist was calculated for this run.'}
                </p>
              </div>
              <button
                disabled={opening}
                onClick={() => void inspect(firstInspection.model.id)}
              >
                {firstInspection.shortlisted
                  ? 'Inspect Shortlisted Candidate'
                  : 'Inspect First Structure'}
              </button>
            </section>
          )}
          {!!result?.groups?.length && (
            <section
              className={styles.clusterBrowser}
              aria-label="Browse Clusters"
            >
              <div className={styles.resultHeading}>
                <div>
                  <p className={styles.kicker}>Explore Your Results</p>
                  <h3>Browse By Cluster</h3>
                </div>
                <span className={styles.badge}>
                  {
                    filters.filter(
                      (filter) =>
                        filter.cluster !== undefined && filter.cluster >= 0
                    ).length
                  }{' '}
                  Clusters
                </span>
              </div>
              <p className={styles.caption}>
                Each group contains matching sequences and chain counts. Cluster
                numbers are local to that group. Noise was not assigned to a
                cluster.
              </p>
              <div
                className={styles.clusterFilters}
                role="group"
                aria-label="Filter Results By Cluster"
              >
                {filters.map((filter) => (
                  <button
                    key={filter.key}
                    aria-pressed={selectedFilter.key === filter.key}
                    onClick={() => {
                      setFilterKey(filter.key);
                      resultsScroll.current?.scrollTo({ top: 0, left: 0 });
                    }}
                  >
                    {filter.label} <span>{filter.ids.size}</span>
                  </button>
                ))}
              </div>
              <div className={styles.clusterSummary} aria-live="polite">
                <strong>{selectedFilter.label}</strong>
                <p>
                  {visibleModels.length}{' '}
                  {visibleModels.length === 1 ? 'Structure' : 'Structures'}{' '}
                  Shown
                  {selectedFilter.group && (
                    <>
                      {' '}
                      ·{' '}
                      {selectedFilter.group.members?.filter(
                        (member) =>
                          selectedFilter.ids.has(member.id) &&
                          member.selected_rank != null
                      ).length ?? 0}{' '}
                      Shortlisted
                    </>
                  )}
                </p>
                {selectedFilter.key === 'unclustered' && (
                  <p>
                    Includes failed structures, incomplete comparisons, and
                    groups too small for the chosen clustering settings. Check
                    each assessment below.
                  </p>
                )}
                {selectedFilter.cluster !== undefined &&
                  selectedFilter.cluster < 0 && (
                    <p>
                      HDBSCAN did not assign these structures to a cluster. They
                      remain available to inspect and download.
                    </p>
                  )}
              </div>
              {representative && (
                <div className={styles.clusterRepresentative}>
                  <div>
                    <p className={styles.kicker}>Cluster Representative</p>
                    <strong>{representative.filename}</strong>
                    <p>
                      This is the cluster medoid. It is not necessarily a
                      shortlisted candidate.
                    </p>
                  </div>
                  <button
                    disabled={!representative.files || opening}
                    onClick={() => void inspect(representative.id)}
                  >
                    Inspect Representative
                  </button>
                </div>
              )}
            </section>
          )}
          <p className={styles.resultCount}>
            {result
              ? `${visibleModels.length} Of ${models.length} Structures Shown`
              : `${models.length} Of ${files.length} Structures Assessed`}
          </p>
          <div
            className={`${styles.tableScroll} ${styles.resultsScroll}`}
            ref={resultsScroll}
            role="region"
            aria-label="Scrollable Structure Results"
            tabIndex={0}
          >
            <table className={styles.analysisTable}>
              <caption>On-Device Structure Results</caption>
              <thead>
                <tr>
                  <th>Structure</th>
                  <th>Assessment</th>
                  {!!result?.groups?.length && (
                    <>
                      <th>Cluster</th>
                      <th>Shortlist</th>
                    </>
                  )}
                  <th>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {visibleModels.map((model) => {
                  const group = result?.groups?.find((item) =>
                    item.ids.includes(model.id)
                  );
                  const member = group?.members?.find(
                    (item) => item.id === model.id
                  );
                  return (
                    <tr key={model.id}>
                      <th scope="row">
                        {model.filename}
                        {group?.representatives?.some(
                          (item) => item.id === model.id
                        ) && (
                          <span className={styles.representativeLabel}>
                            Representative
                          </span>
                        )}
                      </th>
                      <td>
                        {model.state === 'failed'
                          ? model.error
                          : titleCase(model.classification || 'unavailable')}
                        {model.comparison_error && (
                          <p>
                            Comparison unavailable: {model.comparison_error}
                          </p>
                        )}
                      </td>
                      {!!result?.groups?.length && (
                        <>
                          <td>
                            {member?.cluster == null
                              ? 'Not Estimated'
                              : member.cluster < 0
                                ? 'Noise'
                                : `${group.id} / ${member.cluster}`}
                          </td>
                          <td>
                            {member?.selected_rank ? (
                              `#${member.selected_rank}`
                            ) : (
                              <details>
                                <summary>Not Selected</summary>
                                {member?.eligibility_reasons?.length ? (
                                  member.eligibility_reasons.map((reason) => (
                                    <p key={reason}>{titleCase(reason)}</p>
                                  ))
                                ) : (
                                  <p>
                                    {group?.clustering_status === 'failed'
                                      ? group.error
                                      : 'No eligible selection, or redundant under the diversity rule.'}
                                  </p>
                                )}
                              </details>
                            )}
                          </td>
                        </>
                      )}
                      <td>
                        <button
                          disabled={!result || !model.files || opening}
                          onClick={() => void inspect(model.id)}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {result?.groups?.map((group) => (
            <p key={group.id} className={styles.caption}>
              {group.id}:{' '}
              {group.clustering_status === 'insufficient_pool_size'
                ? 'Too few comparable structures for these clustering settings. Available comparisons and individual descriptors are retained.'
                : group.clustering_status === 'failed'
                  ? group.error
                  : `${group.representatives?.length || 0} clusters; ${group.shortlist?.length || 0} shortlisted candidates.`}
            </p>
          ))}
          {result?.warnings.map((warning) => (
            <p className={styles.notice} key={warning}>
              {warning}
            </p>
          ))}
          {result && (
            <p className={styles.caption}>
              {result.recovery?.resumed && (
                <>
                  Recovered {result.recovery.reused_descriptors} structure
                  assessments and {result.recovery.reused_alignments}{' '}
                  comparisons from saved progress.{' '}
                </>
              )}
              Recorded calculation time: {Math.round(result.elapsed_seconds)}{' '}
              seconds, including engine setup. The ZIP contains successful
              reports, original coordinates, component outputs, checksums, and
              calculation versions. Any failed structures are listed in
              results.json.
              {result.exports &&
                ' Extract the ZIP and open Run Summary.html for the run report. Selected structures and their individual reports are collected in shortlisted/.'}
              {result.clustering_status === 'requested'
                ? ' Comparison groups include distance matrices, clustering, representatives, and shortlist eligibility.'
                : ' Comparisons and clustering were not requested.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
