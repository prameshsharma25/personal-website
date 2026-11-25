import { useEffect, useRef, useState } from 'react';
import {
  formatBytes,
  formatDuration,
  type DeviceDiagnostics,
} from '../lib/amyloid-diagnostics';
import styles from '../styles/Tools.module.css';

// Gauge ranges describe work assigned to this run, never whole-device usage.
function DiagnosticGauge({
  label,
  value,
  maximum,
  display,
  detail,
  maximumLabel,
  tone = 'mint',
}: {
  label: string;
  value: number | null;
  maximum: number | null;
  display: string;
  detail: string;
  maximumLabel: string;
  tone?: 'mint' | 'cyan' | 'violet';
}) {
  const available =
    value !== null &&
    maximum !== null &&
    Number.isFinite(value) &&
    Number.isFinite(maximum) &&
    maximum > 0;
  const bounded = available ? Math.max(0, Math.min(value, maximum)) : 0;
  const percent = available ? (bounded / maximum) * 100 : 0;
  return (
    <div
      className={styles.diagnosticGauge}
      data-tone={tone}
      role={available ? 'meter' : undefined}
      aria-label={available ? label : undefined}
      aria-valuemin={available ? 0 : undefined}
      aria-valuemax={available ? maximum : undefined}
      aria-valuenow={available ? bounded : undefined}
      aria-valuetext={
        available
          ? `${display}. ${detail}. Scale: 0 to ${maximumLabel}.`
          : undefined
      }
    >
      <svg viewBox="0 0 200 122" aria-hidden="true" focusable="false">
        <path className={styles.gaugeGuide} d="M 8 100 A 92 92 0 0 1 192 100" />
        <path
          className={styles.gaugeTrack}
          d="M 20 100 A 80 80 0 0 1 180 100"
        />
        <path
          className={styles.gaugeFill}
          d="M 20 100 A 80 80 0 0 1 180 100"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - percent}
          style={{ opacity: percent > 0 ? 1 : 0 }}
        />
      </svg>
      <div className={styles.gaugeValue}>
        <strong>{display}</strong>
        <span>{detail}</span>
      </div>
      <div className={styles.gaugeScale} aria-hidden="true">
        <span>0</span>
        <span>{maximumLabel}</span>
      </div>
    </div>
  );
}

export default function AnalysisDiagnostics({
  data,
  receivedAt,
  running,
  inputCount,
  inputBytes,
}: {
  data: DeviceDiagnostics | null;
  receivedAt: number;
  running: boolean;
  inputCount: number;
  inputBytes: number;
}) {
  const [age, setAge] = useState(0);
  const [delay, setDelay] = useState<number | null>(null);
  const [visible, setVisible] = useState(true);
  const latestReceivedAt = useRef(receivedAt);
  latestReceivedAt.current = receivedAt;
  useEffect(() => {
    if (!running) return;
    let expected = performance.now() + 1000;
    setDelay(null);
    const visibility = () => {
      setVisible(!document.hidden);
      setDelay(null);
      expected = performance.now() + 1000;
    };
    visibility();
    const interval = setInterval(() => {
      const now = performance.now();
      setDelay(document.hidden ? null : Math.max(0, now - expected));
      setAge(
        latestReceivedAt.current
          ? Math.max(0, now - latestReceivedAt.current)
          : 0
      );
      expected = now + 1000;
    }, 1000);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [running]);
  const stage = data?.stage;
  const unit =
    stage?.phase === 'alignment'
      ? 'alignments'
      : stage?.phase === 'clustering'
        ? 'groups'
        : 'structures';
  const stageName =
    stage?.phase === 'alignment'
      ? 'Alignment'
      : stage?.phase === 'clustering'
        ? 'Clustering'
        : 'Descriptors';
  const network = data?.network;
  const observed = network?.supported && network.measuredRequests > 0;
  const finished = !!stage && stage.completed + stage.skipped === stage.total;
  const descriptorPool = data?.descriptorPool;
  const alignmentPool = data?.alignmentPool;
  const descriptorActive =
    running && !descriptorPool?.stopped ? (descriptorPool?.active ?? 0) : 0;
  const alignmentActive =
    running && !alignmentPool?.stopped ? (alignmentPool?.active ?? 0) : 0;
  const checked = stage ? stage.completed + stage.skipped : null;
  return (
    <details className={styles.diagnostics} open>
      <summary>
        Live Diagnostics
        <span className={styles.diagnosticState} data-running={running}>
          {running ? 'Running On Your Device' : 'Last Run'}
        </span>
      </summary>
      <div role="region" aria-label="Live Diagnostics" aria-live="off">
        <p className={styles.diagnosticIntro}>
          {inputCount} {inputCount === 1 ? 'Structure' : 'Structures'} ·{' '}
          {formatBytes(inputBytes)} Of Input · No Structure Uploads
        </p>
        <dl className={`${styles.diagnosticGrid} ${styles.gaugeGrid}`}>
          <div>
            <dt>Descriptor Workers</dt>
            <dd>
              <DiagnosticGauge
                label="Descriptor Worker Activity"
                value={descriptorPool?.size ? descriptorActive : null}
                maximum={descriptorPool?.size ?? null}
                display={
                  descriptorPool?.size
                    ? `${descriptorActive} / ${descriptorPool.size}`
                    : 'Waiting'
                }
                detail="Active Workers"
                maximumLabel={
                  descriptorPool?.size
                    ? `${descriptorPool.size} Workers`
                    : 'Not Started'
                }
              />
              <p>
                {descriptorPool?.peakActive || 0} active at peak.{' '}
                {!running || descriptorPool?.stopped
                  ? 'Descriptor calculations have stopped.'
                  : 'Each worker calculates one structure at a time.'}
              </p>
            </dd>
          </div>
          <div>
            <dt>Alignment Workers</dt>
            <dd>
              <DiagnosticGauge
                label="Alignment Worker Activity"
                tone="cyan"
                value={alignmentPool?.size ? alignmentActive : null}
                maximum={alignmentPool?.size ?? null}
                display={
                  alignmentPool?.size
                    ? `${alignmentActive} / ${alignmentPool.size}`
                    : 'Waiting'
                }
                detail="Active Workers"
                maximumLabel={
                  alignmentPool?.size
                    ? `${alignmentPool.size} Workers`
                    : 'Not Started'
                }
              />
              <p>
                {alignmentPool?.peakActive || 0} active at peak.{' '}
                {!running || alignmentPool?.stopped
                  ? 'The alignment pool is stopped.'
                  : 'Independent MM-align comparisons share the queue.'}
              </p>
            </dd>
          </div>
          <div>
            <dt>Stage Checks</dt>
            <dd>
              <DiagnosticGauge
                label="Current Stage Progress"
                value={checked}
                maximum={stage?.total ?? null}
                display={
                  stage?.total
                    ? `${Math.floor(Math.min(1, (checked ?? 0) / stage.total) * 100)}%`
                    : 'Preparing'
                }
                detail={
                  stage
                    ? `${checked} / ${stage.total} Checked`
                    : 'Waiting For Work'
                }
                maximumLabel={
                  stage?.total ? `${stage.total} Checks` : 'Pending'
                }
              />
              <p>
                {stage ? `${stageName}. ` : ''}
                {stage?.failed || 0} failed operations · {stage?.skipped || 0}{' '}
                skipped. Skips do not inflate the calculation rate.
              </p>
            </dd>
          </div>
          <div>
            <dt>Python WASM Memory</dt>
            <dd>
              <DiagnosticGauge
                label="Python Memory Relative To Sampled Peak"
                tone="violet"
                value={data?.pythonMemoryBytes ?? null}
                maximum={data?.peakPythonMemoryBytes ?? null}
                display={formatBytes(data?.pythonMemoryBytes ?? null)}
                detail="Allocated"
                maximumLabel={
                  data?.peakPythonMemoryBytes
                    ? `${formatBytes(data.peakPythonMemoryBytes)} Peak`
                    : 'Peak Pending'
                }
              />
              <p>
                Scale uses the sampled peak for this run, not your device
                capacity. Allocation drops when Python workers stop.
              </p>
            </dd>
          </div>
        </dl>
        <dl className={`${styles.diagnosticGrid} ${styles.diagnosticStats}`}>
          <div>
            <dt>Calculation Rate</dt>
            <dd>
              <strong>
                {stage?.ratePerMinute != null
                  ? `${stage.ratePerMinute.toFixed(1)} / min`
                  : 'Measuring…'}
              </strong>
              <p>
                {stage
                  ? `${stageName}: ${unit} processed per minute.`
                  : 'Available after the first calculation.'}
              </p>
            </dd>
          </div>
          <div>
            <dt>Stage Time Remaining</dt>
            <dd>
              <strong>
                {finished
                  ? 'Complete'
                  : stage?.remainingMs != null
                    ? `≈ ${formatDuration(stage.remainingMs)}`
                    : 'Measuring…'}
              </strong>
              <p>
                Estimate from the recent completion rate across workers, after
                at least three samples. Excludes later stages.
              </p>
            </dd>
          </div>
          <div>
            <dt>Last Calculation</dt>
            <dd>
              <strong>{formatDuration(stage?.lastMs ?? null)}</strong>
              <p>
                {stage?.meanMs != null
                  ? `${formatDuration(stage.meanMs)} recent average. `
                  : ''}
                Wall time for one structure, alignment, or group.
              </p>
            </dd>
          </div>
          <div>
            <dt>Engine Downloads</dt>
            <dd>
              <strong>
                {observed ? formatBytes(network.transferBytes) : 'Unavailable'}
              </strong>
              <p>
                {network?.requests || 0} completed engine requests.{' '}
                {network?.cachedRequests || 0} served locally or from cache;{' '}
                {network?.unmeasuredRequests || 0} with unavailable transfer
                size.
              </p>
            </dd>
          </div>
          <div>
            <dt>Engine Download Rate</dt>
            <dd>
              <strong>
                {observed && network.bytesPerSecond != null
                  ? `${formatBytes(network.bytesPerSecond)}/s`
                  : 'Unavailable'}
              </strong>
              <p>
                Average across observed transfers. Cached and unmeasured bytes
                are excluded.
              </p>
            </dd>
          </div>
          <div>
            <dt>Interface Delay</dt>
            <dd>
              <strong>
                {!running
                  ? 'Stopped'
                  : !visible
                    ? 'Background Tab'
                    : formatDuration(delay)}
              </strong>
              <p>
                Delay of the page’s timer, sampled every second. Includes
                browser scheduling; not network latency.
              </p>
            </dd>
          </div>
        </dl>
        <p className={styles.diagnosticNote}>
          {running
            ? data
              ? `Last engine sample ${Math.floor(age / 1000)}s ago. `
              : 'Waiting for the engine. '
            : 'Last measurements from this run. '}
          Samples update between calculation steps; a long calculation can delay
          them. CPU utilization and total device RAM usage are unavailable.
          Python memory excludes MM-align, file storage, and other page memory.
          Download measurements cover the coordinator only and can be partial
          when the browser restricts timing information. Descriptor worker
          downloads are excluded.
        </p>
      </div>
    </details>
  );
}
