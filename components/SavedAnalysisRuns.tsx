import { useState } from 'react';
import type { CheckpointSummary } from '../lib/amyloid-checkpoints';
import styles from '../styles/Tools.module.css';

type Status = 'all' | 'running' | 'paused' | 'completed' | 'failed';
const labels: Record<Status, string> = {
  all: 'All Runs',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
};
export default function SavedAnalysisRuns({
  runs,
  selectedId,
  busy,
  onOpen,
  onNew,
}: {
  runs: CheckpointSummary[];
  selectedId: string | null;
  busy: boolean;
  onOpen: (run: CheckpointSummary) => void;
  onNew: () => void;
}) {
  const [filter, setFilter] = useState<Status>('all');
  const visible = runs.filter(
    (run) => filter === 'all' || run.displayStatus === filter
  );
  return (
    <section className={styles.runHistory} aria-label="Run History">
      <div className={styles.resultHeading}>
        <div>
          <p className={styles.kicker}>Saved On This Device</p>
          <h2>Your Analysis Runs</h2>
        </div>
        <button className={styles.newRunButton} disabled={busy} onClick={onNew}>
          New Analysis
        </button>
      </div>
      <p className={styles.caption}>
        Open a run to restore its structures and settings. Completed runs also
        restore results, clusters, and downloads.
      </p>
      <div
        className={styles.clusterFilters}
        role="group"
        aria-label="Filter Runs By Status"
      >
        {(Object.keys(labels) as Status[]).map((status) => (
          <button
            key={status}
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {labels[status]}{' '}
            <span>
              {status === 'all'
                ? runs.length
                : runs.filter((run) => run.displayStatus === status).length}
            </span>
          </button>
        ))}
      </div>
      {visible.length ? (
        <ul className={styles.runList} aria-label="Saved Runs">
          {visible.map((run) => (
            <li key={run.id}>
              <button
                className={styles.runCard}
                aria-pressed={run.id === selectedId}
                disabled={busy || !!run.busy}
                onClick={() => onOpen(run)}
                aria-label={`Open ${run.name}, ${labels[run.displayStatus || 'paused']}`}
              >
                <span className={styles.runCardTop}>
                  <strong>{run.name}</strong>
                  <span
                    className={styles.runStatus}
                    data-status={run.displayStatus}
                  >
                    {labels[run.displayStatus || 'paused']}
                    {run.hasErrors ? ' With Errors' : ''}
                  </span>
                </span>
                <span>
                  {run.inputCount}{' '}
                  {run.inputCount === 1 ? 'Structure' : 'Structures'} ·{' '}
                  {run.descriptors} Saved Assessments · {run.alignments} Saved
                  Comparisons
                </span>
                <span className={styles.runDate}>
                  Started {new Date(run.createdAt).toLocaleString()} ·{' '}
                  {run.id.slice(0, 8)}
                  {run.busy ? ' · Active Tab' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.runEmpty}>
          {runs.length
            ? 'No runs match this status.'
            : 'Your saved analyses will appear here when calculations begin.'}
        </p>
      )}
      {busy && (
        <p className={styles.caption}>
          Pause the current analysis before opening another run.
        </p>
      )}
      <p className={styles.caption}>
        Run history stays in this browser. Download important reports before
        clearing site data.
      </p>
    </section>
  );
}
