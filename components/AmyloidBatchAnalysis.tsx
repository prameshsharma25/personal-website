import AnalysisProgress from './AnalysisProgress';
import { useEffect, useRef, useState } from 'react';
import {
  inspectFiles,
  readStructure,
  titleCase,
  type Inspection,
} from '../lib/amyloid-inspector';
import {
  jobRequest,
  JobRequestError,
  JOB_STORAGE_KEY,
  type AnalysisJob,
  type AnalysisModel,
  type JobAccess,
} from '../lib/amyloid-jobs';
import styles from '../styles/Tools.module.css';

type Limits = {
  max_files: number;
  max_file_bytes: number;
  max_total_bytes: number;
  retention_hours: number;
};
export default function AmyloidBatchAnalysis({
  onInspect,
  onPreview,
  onReset,
}: {
  onInspect: (result: Inspection) => void;
  onPreview: (structure: NonNullable<Inspection['structure']>) => void;
  onReset: () => void;
}) {
  const [api, setApi] = useState('');
  const [connection, setConnection] = useState('loading');
  const [limits, setLimits] = useState<Limits | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [confidence, setConfidence] = useState<File | null>(null);
  const [minCluster, setMinCluster] = useState(10);
  const [minSamples, setMinSamples] = useState(3);
  const [access, setAccess] = useState<JobAccess | null>(null);
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inspecting, setInspecting] = useState('');
  const generation = useRef(0);
  const inspectedJob = useRef('');
  const callbacks = useRef({ onInspect, onPreview, onReset });
  callbacks.current = { onInspect, onPreview, onReset };
  useEffect(() => {
    let cancelled = false;
    const operation = generation;
    void (async () => {
      try {
        const configuration = await (await fetch('/api/amyloid-config')).json();
        if (!configuration.enabled) {
          if (!cancelled) setConnection('unconfigured');
          return;
        }
        const response = await fetch(`${configuration.url}/health`, {
          credentials: 'omit',
        });
        if (!response.ok) throw new Error('Unavailable');
        const capabilities = await response.json();
        if (cancelled) return;
        setApi(configuration.url);
        setLimits(capabilities);
        setConnection('ready');
        try {
          const saved = JSON.parse(
            sessionStorage.getItem(JOB_STORAGE_KEY) || 'null'
          );
          if (
            saved?.api === configuration.url &&
            /^[a-f0-9]{32}$/.test(saved.id) &&
            typeof saved.token === 'string'
          )
            setAccess(saved);
        } catch {
          /* Session storage can be disabled without preventing new jobs. */
        }
      } catch {
        if (!cancelled) setConnection('unavailable');
      }
    })();
    return () => {
      cancelled = true;
      ++operation.current;
    };
  }, []);
  const terminal =
    !!job &&
    ['completed', 'partial', 'failed', 'cancelled'].includes(job.state);
  const active = !!access && !terminal;
  async function inspectModel(model: AnalysisModel, current = access) {
    if (!model.files || !current) return;
    const identity = ++generation.current;
    setInspecting(model.id);
    setError('');
    try {
      const inputs = await Promise.all(
        Object.values(model.files).map(async (file) => {
          const response = await jobRequest(
            current,
            `/files/${file.split('/').map(encodeURIComponent).join('/')}`
          );
          return {
            name: file.split('/').pop() || file,
            bytes: new Uint8Array(await response.arrayBuffer()),
          };
        })
      );
      const result = await inspectFiles(inputs);
      if (identity === generation.current) callbacks.current.onInspect(result);
    } catch (problem) {
      if (identity === generation.current)
        setError(
          problem instanceof Error
            ? problem.message
            : 'The result could not be opened.'
        );
    } finally {
      if (identity === generation.current) setInspecting('');
    }
  }
  const inspectRef = useRef(inspectModel);
  inspectRef.current = inspectModel;
  useEffect(() => {
    if (!access) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function poll() {
      try {
        const result: AnalysisJob = await (await jobRequest(access!)).json();
        if (cancelled) return;
        failures = 0;
        setJob(result);
        setError('');
        if (['completed', 'partial'].includes(result.state)) {
          if (inspectedJob.current !== access!.id) {
            inspectedJob.current = access!.id;
            const first = result.result?.structures.find(
              (model) => model.state === 'complete'
            );
            if (first) void inspectRef.current(first, access!);
          }
          return;
        }
        if (['failed', 'cancelled'].includes(result.state)) return;
      } catch (problem) {
        if (!cancelled) {
          if (
            problem instanceof JobRequestError &&
            [404, 410].includes(problem.status)
          ) {
            forget();
            setError(problem.message);
            return;
          }
          failures++;
          setError('The connection was interrupted. Retrying your job status…');
        }
      }
      if (!cancelled)
        timer = setTimeout(poll, Math.min(30000, 2000 * 2 ** failures));
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [access]);
  async function choose(selected: File[]) {
    ++generation.current;
    setError('');
    callbacks.current.onReset();
    setFiles(selected);
    if (selected.length === 1) {
      try {
        const identity = generation.current;
        const file = selected[0];
        if (file.size > 25 * 1024 * 1024)
          throw new Error('Each structure must be 25 MB or smaller.');
        const structure = await readStructure({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
        if (identity === generation.current)
          callbacks.current.onPreview(structure);
      } catch (problem) {
        setError(
          problem instanceof Error
            ? problem.message
            : 'The structure could not be opened.'
        );
      }
    }
  }
  async function start() {
    if (!api || !limits || !files.length) return;
    setBusy(true);
    setError('');
    forget();
    callbacks.current.onReset();
    try {
      if (
        files.length > limits.max_files ||
        files.some((file) => file.size > limits.max_file_bytes) ||
        files.reduce((sum, file) => sum + file.size, 0) > limits.max_total_bytes
      )
        throw new Error('The selected files exceed the analysis limits.');
      if (files.some((file) => !/\.(pdb|cif|mmcif)$/i.test(file.name)))
        throw new Error('Select PDB or mmCIF structures only.');
      const data = new FormData();
      files.forEach((file) => data.append('structures', file));
      data.append('min_cluster_size', String(minCluster));
      data.append('min_samples', String(minSamples));
      if (confidence) data.append('confidence', confidence);
      const response = await fetch(`${api}/jobs`, {
        method: 'POST',
        body: data,
        credentials: 'omit',
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.detail === 'string'
            ? result.detail
            : 'The files could not be submitted.'
        );
      const next = { api, id: result.id, token: result.token };
      try {
        sessionStorage.setItem(JOB_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* Resuming after a refresh is optional. */
      }
      setAccess(next);
      setJob(result);
      inspectedJob.current = '';
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : 'Unable to submit the analysis.'
      );
    } finally {
      setBusy(false);
    }
  }
  function forget() {
    ++generation.current;
    setAccess(null);
    setJob(null);
    setInspecting('');
    try {
      sessionStorage.removeItem(JOB_STORAGE_KEY);
    } catch {
      /* optional storage */
    }
  }
  async function remove() {
    if (!access) return;
    setBusy(true);
    setError('');
    try {
      await jobRequest(access, '', { method: 'DELETE' });
      forget();
      callbacks.current.onReset();
    } catch (problem) {
      if (
        problem instanceof JobRequestError &&
        [404, 410].includes(problem.status)
      ) {
        forget();
        callbacks.current.onReset();
      } else {
        setError(
          problem instanceof Error
            ? problem.message
            : 'Unable to remove the analysis.'
        );
      }
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!access) return;
    setBusy(true);
    try {
      const blob = await (await jobRequest(access, '/download')).blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'amyloid-analysis.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : 'The archive could not be downloaded.'
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.batch} aria-label="Analyze Uploaded Structures">
      <div className={styles.upload}>
        <div>
          <p className={styles.kicker}>01 / Analyze Your Structures</p>
          <h2>From Coordinates To Evidence.</h2>
          <p>
            Upload one assembly for descriptors and warnings, or a pool for
            structural comparisons, clustering, and a review report. The service
            analyzes existing structures; it does not generate predictions.
          </p>
        </div>
        <div className={styles.uploadActions}>
          <label htmlFor="analysis-structures">Choose Structures</label>
          <input
            id="analysis-structures"
            type="file"
            accept=".pdb,.cif,.mmcif"
            multiple
            disabled={busy || active}
            onChange={(e) => {
              void choose(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
          <p>
            {files.length
              ? `${files.length} Structures Selected`
              : 'PDB Or mmCIF'}{' '}
            · Up To {limits?.max_files || 125} Files
          </p>
        </div>
      </div>
      {files.length > 0 && (
        <details className={styles.provenance}>
          <summary>Selected Files</summary>
          <ul>
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>{file.name}</li>
            ))}
          </ul>
        </details>
      )}
      <details className={styles.provenance}>
        <summary>Confidence & Clustering Settings</summary>
        <div className={styles.analysisSettings}>
          <label>
            Confidence CSV (Optional)
            <input
              type="file"
              accept=".csv"
              disabled={busy || active}
              onChange={(e) => setConfidence(e.target.files?.[0] || null)}
            />
          </label>
          <p>
            Columns: <code>filename,method,iptm,mean_plddt</code>. Use ipTM from
            0–1 and mean pLDDT from 0–100. Missing confidence is not inferred
            from PDB B-factors; it prevents confidence-based shortlisting, but
            descriptors and clustering still run.{' '}
            <a href="/tools/confidence-template.csv" download>
              Download Template
            </a>
          </p>
          <label>
            Minimum Cluster Size
            <input
              type="number"
              min="2"
              max="125"
              value={minCluster}
              disabled={busy || active}
              onChange={(e) => setMinCluster(Number(e.target.value))}
            />
          </label>
          <label>
            Minimum Samples
            <input
              type="number"
              min="1"
              max="124"
              value={minSamples}
              disabled={busy || active}
              onChange={(e) => setMinSamples(Number(e.target.value))}
            />
          </label>
          <p>
            HDBSCAN uses EOM selection. Defaults are 10 and 3; a smaller pool
            may not support clusters. Custom settings and uploaded pools are
            exploratory. Different sequences or chain counts are analyzed in
            separate comparison groups.
          </p>
        </div>
      </details>
      <div className={styles.exampleBar}>
        <button
          className={styles.runButton}
          disabled={connection !== 'ready' || !files.length || busy || active}
          onClick={() => void start()}
        >
          {busy
            ? 'Working…'
            : `Analyze ${files.length || ''} ${files.length === 1 ? 'Structure' : 'Structures'}`}
        </button>
        <span>
          {connection === 'ready'
            ? 'Analysis Service Connected'
            : connection === 'loading'
              ? 'Checking Analysis Service…'
              : 'Analysis Service Not Connected'}
        </span>
      </div>
      <p className={styles.caption}>
        When you select Analyze, your structures are sent to the analysis
        service. Your job-access key is required to retrieve results. Files
        expire after {limits?.retention_hours || 24} hours. Limits: 25 MB per
        file, 100 MB total. A job-access key stays in this browser tab so you
        can resume after a refresh.
      </p>
      {['unconfigured', 'unavailable'].includes(connection) && (
        <p className={styles.notice}>
          Server analysis is not available on this deployment yet. You can
          calculate individual descriptors using On My Device or choose Open
          Existing Reports.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {access && (
        <div className={styles.jobPanel}>
          <div className={styles.resultHeading}>
            <div>
              <p className={styles.kicker}>Analysis Progress</p>
              <h2>
                {job
                  ? titleCase(
                      job.state === 'partial'
                        ? 'finished_with_errors'
                        : job.state
                    )
                  : 'Checking Job…'}
              </h2>
            </div>
            <div className={styles.controls}>
              {terminal && job?.result && (
                <button disabled={busy} onClick={() => void download()}>
                  Download Full Report
                </button>
              )}
              <button disabled={busy} onClick={() => void remove()}>
                {active ? 'Cancel Analysis' : 'Delete Job Files'}
              </button>
            </div>
          </div>
          <AnalysisProgress
            label={
              terminal
                ? titleCase(
                    job.state === 'partial' ? 'finished_with_errors' : job.state
                  )
                : job?.progress
                  ? titleCase(job.progress.stage)
                  : 'Waiting For A Worker'
            }
            running={active}
            phase={job?.progress?.stage}
            completed={
              terminal && ['completed', 'partial'].includes(job.state)
                ? 1
                : job?.progress?.completed
            }
            total={
              terminal && ['completed', 'partial'].includes(job.state)
                ? 1
                : job?.progress?.total
            }
          />
          {job?.error && (
            <p role="alert" className={styles.error}>
              {job.error}
            </p>
          )}
          {job?.result && (
            <>
              <p className={styles.caption}>
                Completed in {Math.round(job.result.elapsed_seconds)} seconds.
                The archive includes individual reports, descriptors, distance
                matrices, cluster memberships, shortlist eligibility, and
                provenance.
              </p>
              {job.result.warnings.map((warning) => (
                <p className={styles.notice} key={warning}>
                  {warning}
                </p>
              ))}
              <div className={styles.tableScroll}>
                <table className={styles.analysisTable}>
                  <caption>Uploaded Structure Results</caption>
                  <thead>
                    <tr>
                      <th>Structure</th>
                      <th>Assessment</th>
                      <th>Cluster</th>
                      <th>Shortlist</th>
                      <th>Inspect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.result.structures.map((model) => {
                      const group = job.result!.groups.find((g) =>
                        g.ids.includes(model.id)
                      );
                      const member = group?.members?.find(
                        (m) => m.id === model.id
                      );
                      return (
                        <tr key={model.id}>
                          <th scope="row">{model.filename}</th>
                          <td>
                            {model.state === 'failed'
                              ? model.error
                              : titleCase(
                                  model.classification || 'unavailable'
                                )}
                          </td>
                          <td>
                            {member?.cluster == null
                              ? 'Not Estimated'
                              : member.cluster < 0
                                ? 'Noise'
                                : `${group!.id} / ${member.cluster}`}
                          </td>
                          <td>
                            {member?.selected_rank ? (
                              `#${member.selected_rank}`
                            ) : (
                              <details>
                                <summary>Not Selected</summary>
                                {member?.eligibility_reasons.length ? (
                                  member.eligibility_reasons.map((reason) => (
                                    <p key={reason}>{titleCase(reason)}</p>
                                  ))
                                ) : (
                                  <p>
                                    {model.state === 'failed'
                                      ? 'Structure analysis failed.'
                                      : group?.clustering_status === 'failed'
                                        ? 'Structural comparison failed; no shortlist was calculated.'
                                        : 'Outside the review budget or redundant under the diversity rule.'}
                                  </p>
                                )}
                              </details>
                            )}
                          </td>
                          <td>
                            <button
                              disabled={!model.files || !!inspecting}
                              onClick={() => void inspectModel(model)}
                            >
                              {inspecting === model.id ? 'Opening…' : 'Inspect'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {job.result.groups.map((group) => (
                <p key={group.id} className={styles.caption}>
                  {group.id}:{' '}
                  {group.clustering_status === 'insufficient_pool_size'
                    ? 'Too few comparable structures for the selected clustering settings. Descriptors and available pairwise comparisons were still calculated.'
                    : group.clustering_status === 'failed'
                      ? group.error
                      : `${group.representatives?.length || 0} clusters; ${group.shortlist?.length || 0} shortlisted candidates.`}
                </p>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
