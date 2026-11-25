import { useEffect, useRef, useState } from 'react';
import {
  formatBytes,
  formatDuration,
  type DeviceDiagnostics,
} from '../lib/amyloid-diagnostics';
import styles from '../styles/Tools.module.css';

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
        <dl className={styles.diagnosticGrid}>
          <div>
            <dt>Descriptor Workers</dt>
            <dd>
              <strong>
                {data?.descriptorPool?.size
                  ? `${running ? data.descriptorPool.active : 0} / ${data.descriptorPool.size} Active`
                  : 'Not Started'}
              </strong>
              <p>
                {data?.descriptorPool?.peakActive || 0} active at peak.{' '}
                {!running || data?.descriptorPool?.stopped
                  ? 'Descriptor calculations have stopped.'
                  : 'Each worker calculates one structure at a time.'}
              </p>
            </dd>
          </div>
          <div>
            <dt>Alignment Workers</dt>
            <dd>
              <strong>
                {data?.alignmentPool?.size
                  ? `${running ? data.alignmentPool.active : 0} / ${data.alignmentPool.size} Active`
                  : 'Not Started'}
              </strong>
              <p>
                {data?.alignmentPool?.peakActive || 0} active at peak.{' '}
                {!running || data?.alignmentPool?.stopped
                  ? 'The alignment pool is stopped.'
                  : 'Independent MM-align comparisons share the queue.'}
              </p>
            </dd>
          </div>
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
            <dt>Python WASM Memory</dt>
            <dd>
              <strong>{formatBytes(data?.pythonMemoryBytes ?? null)}</strong>
              <p>
                {data?.peakPythonMemoryBytes
                  ? `${formatBytes(data.peakPythonMemoryBytes)} sampled peak. `
                  : ''}
                Sampled allocation across active Python engines. Counts drop
                when descriptor workers stop.
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
                Delay of the page’s one-second timer. Includes browser
                scheduling; not network latency.
              </p>
            </dd>
          </div>
          <div>
            <dt>Stage Checks</dt>
            <dd>
              <strong>
                {stage
                  ? `${stage.completed + stage.skipped} / ${stage.total}`
                  : 'Preparing'}
              </strong>
              <p>
                {stage?.failed || 0} failed operations · {stage?.skipped || 0}{' '}
                skipped. Skips do not inflate the calculation rate.
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
