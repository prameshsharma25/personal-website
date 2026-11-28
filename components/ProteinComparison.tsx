import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  type Mapping,
  type ProteinInput,
  type ReferenceProtein,
} from '../lib/protein-annotations';
import {
  comparisonReport,
  comparisonCsv,
  type InspectionProtein,
  type ComparisonMode,
  type ComparisonReport,
  type ProteinComparisonResult,
} from '../lib/protein-comparison';
import ProteinComparisonViewer from './ProteinComparisonViewer';
import styles from '../styles/ProteinComparison.module.css';

type Ready = {
  primary: ProteinInput;
  comparison: ProteinInput;
  chain: string;
  otherChain: string;
  result: ProteinComparisonResult;
  mode: ComparisonMode;
};
export default function ProteinComparison({
  input,
  chain,
  other,
  otherChain,
  enabled,
  selected,
  onPick,
  inspectionProtein,
  primaryReference,
  primaryMapping,
  comparisonReference,
  comparisonMapping,
  focus,
  onReport,
  children,
}: {
  input: ProteinInput;
  chain: string;
  other: ProteinInput | null;
  otherChain: string;
  enabled: boolean;
  selected: Set<string>;
  onPick: (key: string, add: boolean) => void;
  inspectionProtein: InspectionProtein;
  primaryReference: ReferenceProtein | null;
  primaryMapping: Mapping | null;
  comparisonReference: ReferenceProtein | null;
  comparisonMapping: Mapping | null;
  focus: number;
  onReport: (report: ComparisonReport | null) => void;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<ComparisonMode>('structure');
  const [ready, setReady] = useState<Ready | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState('');
  const [active, setActive] = useState<number | null>(null);
  // Hover is transient; keyboard navigation must keep its position when the
  // pointer enters or leaves the viewer during scrolling.
  const [cursor, setCursor] = useState(0);
  const chartHost = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(640);
  // Ignore a stale worker result immediately, even before effect cleanup runs.
  const result =
    ready?.primary === input &&
    ready?.comparison === other &&
    ready?.chain === chain &&
    ready?.otherChain === otherChain &&
    ready?.mode === mode
      ? ready.result
      : null;
  useEffect(() => {
    setReady(null);
    setActive(null);
    setCursor(0);
    setError('');
    if (!other || !input?.pdb) {
      setLoading('');
      return;
    }
    let disposed = false,
      worker: Worker;
    setLoading('Matching Residues And Aligning Structures…');
    try {
      worker = new Worker(
        new URL('../lib/protein-comparison-worker.ts', import.meta.url)
      );
      worker.onmessage = (
        event: MessageEvent<{
          result?: ProteinComparisonResult;
          error?: string;
          progress?: string;
        }>
      ) => {
        if (disposed) return;
        if (event.data.progress) {
          setLoading(event.data.progress);
          return;
        }
        setLoading('');
        if (event.data.error) setError(event.data.error);
        else if (event.data.result)
          setReady({
            primary: input,
            comparison: other,
            chain,
            otherChain,
            result: event.data.result,
            mode,
          });
        worker.terminate();
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (!disposed) {
          setLoading('');
          setError(
            'The comparison worker could not start. Reload the page and try again.'
          );
        }
        worker.terminate();
      };
      worker.postMessage({
        primary: input,
        primaryChain: chain,
        comparison: other,
        comparisonChain: otherChain,
        mode,
      });
    } catch {
      setLoading('');
      setError('This browser could not start a local comparison worker.');
      worker?.terminate();
    }
    return () => {
      disposed = true;
      worker?.terminate();
    };
  }, [input, chain, other, otherChain, mode]);
  const hasResult = Boolean(result);
  useEffect(() => {
    const element = chartHost.current;
    if (!element || !enabled || !hasResult) return;
    const resize = new ResizeObserver(([entry]) => {
      setChartWidth(Math.max(260, Math.min(640, entry.contentRect.width)));
    });
    resize.observe(element);
    return () => resize.disconnect();
  }, [enabled, hasResult]);
  const report = useMemo(
    () =>
      result && other
        ? comparisonReport(
            input,
            other,
            result,
            primaryReference,
            primaryMapping,
            comparisonReference,
            comparisonMapping
          )
        : null,
    [
      input,
      other,
      result,
      primaryReference,
      primaryMapping,
      comparisonReference,
      comparisonMapping,
    ]
  );
  useEffect(() => {
    onReport(report);
    return () => onReport(null);
  }, [report, onReport]);
  const download = (data: string, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const current = result?.pairs[active ?? cursor];
  const cursorPair = result?.pairs[cursor];
  const w = chartWidth,
    h = 190,
    left = 48,
    right = 18,
    top = 18,
    bottom = 40;
  const max = Math.max(result?.maxDistance || 0, 1),
    count = result?.pairs.length || 1;
  const x = (index: number) =>
    left + ((w - left - right) * index) / Math.max(count - 1, 1);
  const y = (distance: number) =>
    h - bottom - ((h - top - bottom) * distance) / max;
  const plot = result?.pairs
    .map((p, i) => `${x(i)},${y(p.distance)}`)
    .join(' ');
  return (
    <div
      className={styles.comparison}
      aria-label="Protein Structure Comparison"
    >
      {enabled && (
        <div className={styles.setup}>
          <h3>Align And Compare Structures</h3>
          <p>
            Protein 2 is aligned to Protein 1. Switch between the individual
            structures and their overlay below. Each protein has its own
            reference annotations and inspection controls.
          </p>
          <label>
            Alignment Method
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ComparisonMode)}
            >
              <option value="structure">Structural Alignment (MM-align)</option>
              <option value="sequence">Sequence Correspondence</option>
            </select>
          </label>
          <p className={styles.note}>
            {mode === 'structure'
              ? 'Searches for matching 3D geometry without a sequence identity cutoff. Different proteins can be compared.'
              : 'Fits residues paired by sequence. Weak or tied alignments are shown with interpretation notes.'}
          </p>
          {!other && (
            <p className={styles.note}>
              Add Protein 2 in the upload cards above to start the comparison.
            </p>
          )}
          {loading && <p role="status">{loading}</p>}
          {error && (
            <p role="alert" className={styles.warning}>
              {error}
              {mode === 'structure' &&
                ' You can also try Sequence Correspondence.'}
            </p>
          )}
        </div>
      )}
      {enabled && result && other ? (
        <>
          <ProteinComparisonViewer
            primary={input}
            comparison={other}
            result={result}
            selected={selected}
            active={active}
            onActive={setActive}
            onPick={(key, add) => {
              const index = result.pairs.findIndex(
                (pair) => pair[inspectionProtein].key === key
              );
              if (index >= 0) setCursor(index);
              onPick(key, add);
            }}
            inspectionProtein={inspectionProtein}
            reference={
              inspectionProtein === 'primary'
                ? primaryReference
                : comparisonReference
            }
            mapping={
              inspectionProtein === 'primary'
                ? primaryMapping
                : comparisonMapping
            }
            focus={focus}
          />
          <div className={styles.metrics} aria-label="Comparison Metrics">
            <div>
              <strong>
                {result.rmsd.toFixed(2)} <small>Å</small>
              </strong>
              <span>
                {result.mode === 'structure'
                  ? 'Overlay RMSD'
                  : 'Alpha Carbon RMSD'}
              </span>
            </div>
            <div>
              <strong>{result.pairs.length}</strong>
              <span>Paired Residues</span>
            </div>
            <div>
              <strong>{Math.round(result.identity * 100)}%</strong>
              <span>Identity In Paired Residues</span>
            </div>
          </div>
          <p className={styles.coverage}>
            Primary Coverage {Math.round(result.primaryCoverage * 100)}% ·
            Comparison Coverage {Math.round(result.comparisonCoverage * 100)}% ·{' '}
            {result.substitutions} Nonidentical Pairs
          </p>
          {result.tmScores && (
            <>
              <div
                className={styles.metrics}
                aria-label="Structural Similarity Scores"
                style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
              >
                <div>
                  <strong>{result.tmScores.primary.toFixed(3)}</strong>
                  <span>TM Score · Primary Length</span>
                </div>
                <div>
                  <strong>{result.tmScores.comparison.toFixed(3)}</strong>
                  <span>TM Score · Comparison Length</span>
                </div>
              </div>
              <p className={styles.note}>
                TM scores describe structural similarity using each chain’s
                length. They are not confidence probabilities.
              </p>
            </>
          )}
          <div
            className={styles.note}
            aria-label="Alignment Method And Interpretation"
          >
            <p>
              <strong>
                {result.mode === 'structure'
                  ? 'Structural Alignment · MM-align'
                  : 'Sequence Correspondence · Rigid Fit'}
              </strong>
            </p>
            {result.warnings.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
          <div ref={chartHost} className={styles.chartPanel}>
            <h3>Residue Differences</h3>
            <p className={styles.note}>
              Hover to highlight both structures. Click to select a residue in
              Protein {inspectionProtein === 'primary' ? '1' : '2'} and see its
              annotations. The slider also supports keyboard selection.
            </p>
            <svg
              viewBox={`0 0 ${w} ${h}`}
              className={styles.chart}
              role="img"
              aria-label="Alpha carbon distance for each aligned residue, in angstroms"
              onPointerMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const px = ((e.clientX - box.left) / box.width) * w;
                setActive(
                  Math.max(
                    0,
                    Math.min(
                      count - 1,
                      Math.round(
                        ((px - left) / (w - left - right)) * (count - 1)
                      )
                    )
                  )
                );
              }}
              onPointerLeave={() => setActive(null)}
              onClick={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const px = ((e.clientX - box.left) / box.width) * w;
                const index = Math.max(
                  0,
                  Math.min(
                    count - 1,
                    Math.round(((px - left) / (w - left - right)) * (count - 1))
                  )
                );
                setActive(index);
                setCursor(index);
                onPick(
                  result.pairs[index][inspectionProtein].key,
                  e.shiftKey || e.ctrlKey || e.metaKey
                );
              }}
            >
              {[0, 0.5, 1].map((t) => (
                <g key={t}>
                  <line
                    x1={left}
                    x2={w - right}
                    y1={y(max * t)}
                    y2={y(max * t)}
                    stroke="#294565"
                  />
                  <text x={left - 8} y={y(max * t) + 4} textAnchor="end">
                    {(max * t).toFixed(1)}
                  </text>
                </g>
              ))}
              <text x={left} y={12}>
                Å
              </text>
              <polyline
                points={plot}
                fill="none"
                stroke="#7bd3ff"
                strokeWidth="2"
              />
              {result.pairs.map((p, i) =>
                selected.has(p[inspectionProtein].key) ? (
                  <circle
                    key={p.primary.key}
                    cx={x(i)}
                    cy={y(p.distance)}
                    r="4"
                    fill="#ffdc76"
                  />
                ) : null
              )}
              {active != null && (
                <>
                  <line
                    x1={x(active)}
                    x2={x(active)}
                    y1={top}
                    y2={h - bottom}
                    stroke="#f38bff"
                    strokeDasharray="3 4"
                  />
                  <circle
                    cx={x(active)}
                    cy={y(result.pairs[active].distance)}
                    r="5"
                    fill="#f38bff"
                  />
                </>
              )}
              <text x={left} y={h - 19}>
                {result.pairs[0][inspectionProtein].number}
              </text>
              <text x={w - right} y={h - 19} textAnchor="end">
                {result.pairs[count - 1][inspectionProtein].number}
              </text>
              <text x={w / 2} y={h - 2} textAnchor="middle">
                Protein {inspectionProtein === 'primary' ? '1' : '2'} Residues
                In Aligned Order
              </text>
            </svg>
            <label>
              Compared Residue
              <input
                type="range"
                min={1}
                max={count}
                value={cursor + 1}
                aria-valuetext={
                  cursorPair
                    ? `${cursorPair[inspectionProtein].name} ${cursorPair[inspectionProtein].number}; ${cursorPair.distance.toFixed(2)} angstroms`
                    : undefined
                }
                onChange={(e) => {
                  const index = Number(e.target.value) - 1;
                  setActive(index);
                  setCursor(index);
                  onPick(result.pairs[index][inspectionProtein].key, false);
                }}
              />
            </label>
            {current && (
              <div className={styles.readout} data-comparison-residue>
                <span>
                  Primary {current.primary.name} {current.primary.number}
                </span>
                <span>
                  Comparison {current.comparison.name}{' '}
                  {current.comparison.number}
                </span>
                <strong>{current.distance.toFixed(2)} Å</strong>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                const i = result.pairs.reduce(
                  (best, p, index) =>
                    p.distance > result.pairs[best].distance ? index : best,
                  0
                );
                setActive(i);
                setCursor(i);
                onPick(result.pairs[i][inspectionProtein].key, false);
              }}
            >
              Select Largest Difference
            </button>
          </div>
          <div className={styles.controls}>
            <button
              type="button"
              onClick={() =>
                download(
                  JSON.stringify(
                    { ...report, exportedAt: new Date().toISOString() },
                    null,
                    2
                  ),
                  'protein-comparison.json',
                  'application/json'
                )
              }
            >
              Download Comparison Report
            </button>
            <button
              type="button"
              onClick={() =>
                download(
                  comparisonCsv(report),
                  'protein-residue-differences.csv',
                  'text/csv'
                )
              }
            >
              Download Residue CSV
            </button>
          </div>
          <details className={styles.method}>
            <summary>How This Comparison Works</summary>
            <p>{result.method}</p>
            {result.structuralAlignment && (
              <p>
                The overlay and chart use the TM optimized transform. The RMSD
                above is calculated from those displayed distances. MM-align
                also reports{' '}
                {result.structuralAlignment.reportedRmsd.toFixed(2)} Å after a
                separate least squares fit of the same paired residues. Both
                values and the original output are included in the report.
              </p>
            )}
            <p>
              No minimum sequence identity or similarity score is required to
              display a fit. Both coverage figures refer to residues with
              coordinates. RMSD and sequence identity describe only the paired
              subset. A small subset can fit well even when the complete
              proteins have different structures.
            </p>
            {result.mode === 'structure' && (
              <p>
                The MM-align transform and residue pairing are preserved in the
                overlay and report. This is a rigid structural search with no
                reflection or flexible fitting. It does not guarantee the global
                best alignment. See the{' '}
                <a
                  href="https://github.com/pylelab/USalign"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  alignment software and references
                </a>
                .
              </p>
            )}
            <p>
              Unpaired residues are gray in Structure and Difference modes and
              are excluded from RMSD. Distance colors describe coordinate
              differences, not confidence or functional significance. Reference
              annotations remain attached to the protein for which they were
              loaded. Structural alignment does not transfer annotations.
            </p>
          </details>
        </>
      ) : (
        children
      )}
    </div>
  );
}
