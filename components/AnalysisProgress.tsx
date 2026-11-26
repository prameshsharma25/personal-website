import styles from '../styles/Tools.module.css';

export default function AnalysisProgress({
  label,
  running,
  completed = 0,
  total = 0,
  filename = '',
  phase = '',
  elapsedMs,
}: {
  label: string;
  running: boolean;
  completed?: number;
  total?: number;
  filename?: string;
  phase?: string;
  elapsedMs?: number | null;
}) {
  const elapsed = Math.max(0, Math.floor((elapsedMs ?? 0) / 1000));
  const measured = total > 0;
  const count = Math.max(0, Math.min(completed, total));
  const percent = measured ? Math.floor((count / total) * 100) : undefined;
  const unit =
    phase === 'alignment'
      ? 'alignments'
      : phase === 'clustering'
        ? 'groups'
        : 'stages';
  return (
    <div className={styles.analysisProgress} data-running={running}>
      <div className={styles.progressHeading}>
        <span role="status">{label}</span>
        {measured && <strong>{percent}%</strong>}
      </div>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label="Analysis Progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={
          measured ? `${count} of ${total} ${unit} complete: ${label}` : label
        }
        data-indeterminate={!measured && running}
      >
        <div
          className={styles.progressFill}
          style={measured ? { width: `${percent}%` } : undefined}
        />
      </div>
      <div className={styles.progressMeta}>
        <span>
          {filename ||
            (measured
              ? `${count} / ${total} ${unit} completed`
              : running
                ? 'Preparing This Stage'
                : 'Stopped')}
          {filename && measured ? ` · ${count} / ${total} ${unit}` : ''}
        </span>
        {elapsedMs != null && (
          <span role="timer" aria-label="Active Analysis Time" aria-live="off">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}{' '}
            Elapsed
          </span>
        )}
      </div>
      {running && measured && (
        <p className={styles.caption}>
          Progress reflects completed work in this stage; individual
          calculations can take different amounts of time.
        </p>
      )}
    </div>
  );
}
