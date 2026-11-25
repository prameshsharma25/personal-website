import { useEffect, useRef, useState } from 'react';
import {
  inspectFiles,
  readStructure,
  titleCase,
  type Inspection,
} from '../lib/amyloid-inspector';
import {
  validateDeviceFiles,
  type DeviceArtifacts,
  type DeviceMessage,
  type DeviceResult,
} from '../lib/amyloid-device';
import type { AnalysisModel } from '../lib/amyloid-jobs';
import AnalysisProgress from './AnalysisProgress';
import styles from '../styles/Tools.module.css';

type Props = {
  active: boolean;
  onReset: () => void;
  onPreview: (structure: NonNullable<Inspection['structure']>) => void;
  onInspect: (result: Inspection) => void;
};

export default function AmyloidDeviceAnalysis(props: Props) {
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [models, setModels] = useState<AnalysisModel[]>([]);
  const [result, setResult] = useState<DeviceResult | null>(null);
  const [archive, setArchive] = useState<Blob | null>(null);
  const [opening, setOpening] = useState(false);
  const [progressStep, setProgressStep] = useState<Extract<
    DeviceMessage,
    { type: 'progress' }
  > | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [compare, setCompare] = useState(true);
  const [confidence, setConfidence] = useState<File | null>(null);
  const [minCluster, setMinCluster] = useState(10);
  const [minSamples, setMinSamples] = useState(3);
  const worker = useRef<Worker | null>(null);
  const epoch = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const artifacts = useRef<DeviceArtifacts>({});
  const callbacks = useRef(props);
  callbacks.current = props;

  function invalidate() {
    return ++epoch.current;
  }
  function terminate() {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => {
    setReady(true);
    setSupported(
      typeof Worker !== 'undefined' &&
        typeof WebAssembly !== 'undefined' &&
        !!globalThis.crypto?.subtle
    );
    return () => {
      invalidate();
      terminate();
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  async function inspect(id: string) {
    const generation = epoch.current;
    setOpening(true);
    try {
      const inspection = await inspectFiles(artifacts.current[id]);
      if (generation === epoch.current && callbacks.current.active)
        callbacks.current.onInspect(inspection);
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
    terminate();
    artifacts.current = {};
    setError('');
    setProgress('');
    setProgressStep(null);
    setStartedAt(0);
    setConfidence(null);
    setResult(null);
    setArchive(null);
    setModels([]);
    setOpening(false);
    setFiles([]);
    callbacks.current.onReset();
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
          callbacks.current.onPreview(preview);
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
    terminate();
    ++epoch.current;
    setRunning(false);
    setOpening(false);
    setModels([]);
    artifacts.current = {};
    setProgress('Analysis Stopped');
    setError(message);
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
  async function start() {
    const generation = ++epoch.current;
    terminate();
    setError('');
    setResult(null);
    setArchive(null);
    setModels([]);
    setOpening(false);
    artifacts.current = {};
    setRunning(true);
    setStartedAt(Date.now());
    setProgressStep(null);
    setProgress('Reading Your Structures');
    callbacks.current.onReset();
    try {
      validateDeviceFiles(files);
      if (confidence && confidence.size > 65536)
        throw new Error('Confidence CSV must be at most 64 KB.');
      if (
        !Number.isInteger(minCluster) ||
        minCluster < 2 ||
        minCluster > 20 ||
        !Number.isInteger(minSamples) ||
        minSamples < 1 ||
        minSamples > 19
      )
        throw new Error(
          'Use a minimum cluster size of 2–20 and minimum samples of 1–19.'
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
        if (data.type === 'progress') {
          setProgress(data.stage);
          setProgressStep(data);
          watchdog(
            data.phase === 'setup'
              ? 180000
              : data.phase === 'alignment'
                ? 120000
                : 300000
          );
        } else if (data.type === 'model') {
          setModels((current) => [...current, data.model]);
        } else if (data.type === 'error') {
          fail(data.message);
        } else if (data.type === 'complete') {
          terminate();
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
          setProgress(
            data.result.structures.every(
              (model) => model.state === 'complete' && !model.comparison_error
            ) &&
              !data.result.groups?.some(
                (group) => group.clustering_status === 'failed'
              )
              ? 'Analysis Complete'
              : 'Finished With Errors'
          );
          setArchive(new Blob([data.archive], { type: 'application/zip' }));
          artifacts.current = Object.fromEntries(
            Object.entries(data.artifacts).map(([id, inputs]) => [
              id,
              inputs.map((input) => ({
                name: input.name,
                bytes: new Uint8Array(input.bytes),
              })),
            ])
          );
          const first = data.result.structures.find(
            (model) => model.state === 'complete'
          );
          if (first && callbacks.current.active) void inspect(first.id);
        }
      };
      watchdog(180000);
      engine.postMessage(
        {
          type: 'start',
          files: selected,
          compare,
          confidence: confidenceBytes,
          settings: {
            min_cluster_size: minCluster,
            min_samples: minSamples,
            max_candidates: 10,
          },
        },
        [
          ...selected.map((file) => file.bytes),
          ...(confidenceBytes ? [confidenceBytes] : []),
        ]
      );
    } catch (problem) {
      if (generation === epoch.current)
        fail(
          problem instanceof Error
            ? problem.message
            : 'The analysis could not start.'
        );
    }
  }
  function cancel() {
    ++epoch.current;
    terminate();
    setRunning(false);
    setOpening(false);
    setModels([]);
    setResult(null);
    setArchive(null);
    setError('');
    artifacts.current = {};
    setProgress('Cancelled — No Files Were Uploaded');
    callbacks.current.onReset();
  }
  function download() {
    if (!archive) return;
    const url = URL.createObjectURL(archive);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'amyloid-device-results.zip';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section aria-label="On-Device Analysis">
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
            id="amyloid-device-files"
            type="file"
            multiple
            accept=".pdb,.cif,.mmcif"
            disabled={!ready || running}
            onChange={(event) => {
              void select(Array.from(event.target.files || []));
              event.target.value = '';
            }}
          />
          <p>Up to 20 files · 10 MB each · 25 MB total</p>
          {!!files.length && (
            <p>
              {files.length} {files.length === 1 ? 'structure' : 'structures'}{' '}
              selected: {files.map((file) => file.name).join(', ')}
            </p>
          )}
        </div>
      </div>
      {files.length > 1 && (
        <details className={styles.batchSettings} open>
          <summary>Batch Analysis Settings</summary>
          <div className={styles.analysisSettings}>
            <label className={styles.compareToggle}>
              <input
                type="checkbox"
                checked={compare}
                disabled={running}
                onChange={(event) => setCompare(event.target.checked)}
              />{' '}
              Compare And Cluster Structures
            </label>
            {compare && (
              <>
                <p>
                  MM-align compares matching sequences and chain counts. HDBSCAN
                  groups similar assemblies; representative structures and
                  shortlist eligibility are included in the download.
                </p>
                <label>
                  Minimum Cluster Size
                  <input
                    type="number"
                    min="2"
                    max="20"
                    value={minCluster}
                    disabled={running}
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
                    max="19"
                    value={minSamples}
                    disabled={running}
                    onChange={(event) =>
                      setMinSamples(Number(event.target.value))
                    }
                  />
                </label>
                <p>
                  Minimum Samples counts neighboring structures, excluding the
                  structure itself. Small pools may not support clusters.
                  Missing prediction confidence remains unavailable.
                </p>
                <label>
                  Optional Confidence CSV
                  <input
                    type="file"
                    accept=".csv"
                    disabled={running}
                    onChange={(event) =>
                      setConfidence(event.target.files?.[0] || null)
                    }
                  />
                </label>
                <p>
                  Up to 64 KB. Match the exact structure filenames.{' '}
                  <a href="/tools/confidence-template.csv" download>
                    Download A Template
                  </a>
                </p>
              </>
            )}
          </div>
        </details>
      )}
      <div className={styles.exampleBar}>
        <button
          className={styles.runButton}
          disabled={!supported || !files.length || running}
          onClick={() => void start()}
        >
          Analyze On My Device
        </button>
        {running && <button onClick={cancel}>Cancel Analysis</button>}
        {!!(archive || models.length) && !running && (
          <button onClick={() => void select([])}>Clear Local Results</button>
        )}
      </div>
      <p className={styles.caption}>
        The first run downloads the analysis engine from jsDelivr. Calculations
        use your device’s CPU and memory in a background worker. Keep this page
        open and download your results before leaving. Larger assemblies work
        best on a desktop.
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
          connection. Try an up-to-date browser; existing reports can still be
          opened below.
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
          running={running}
          startedAt={startedAt}
          completed={progressStep?.completed}
          total={progressStep?.total}
          filename={progressStep?.filename}
          phase={progressStep?.phase}
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
                  : 'Calculating Your Structures'}
              </h2>
            </div>
            {archive && (
              <div className={styles.controls}>
                <button onClick={download}>Download Local Reports</button>
              </div>
            )}
          </div>
          <div className={styles.tableScroll}>
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
                {models.map((model) => {
                  const group = result?.groups?.find((item) =>
                    item.ids.includes(model.id)
                  );
                  const member = group?.members?.find(
                    (item) => item.id === model.id
                  );
                  return (
                    <tr key={model.id}>
                      <th scope="row">{model.filename}</th>
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
              Finished in {Math.round(result.elapsed_seconds)} seconds after
              loading the engine. The ZIP contains successful reports, original
              coordinates, component outputs, checksums, and calculation
              versions. Any failed structures are listed in results.json.
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
