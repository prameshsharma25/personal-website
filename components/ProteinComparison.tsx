import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ANNOTATION_LIMITS,
  type Mapping,
  type ProteinInput,
  type ReferenceProtein,
} from '../lib/protein-annotations';
import { parseProteinStructure } from '../lib/protein-input';
import {
  comparisonReport,
  comparisonCsv,
  COMPARISON_METHOD,
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
};
export default function ProteinComparison({
  input,
  chain,
  initialComparison,
  selected,
  onPick,
  reference,
  mapping,
  focus,
  onReport,
  children,
}: {
  input: ProteinInput;
  chain: string;
  initialComparison: ProteinInput | null;
  selected: Set<string>;
  onPick: (key: string, add: boolean) => void;
  reference: ReferenceProtein | null;
  mapping: Mapping | null;
  focus: number;
  onReport: (report: ComparisonReport | null) => void;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(Boolean(initialComparison));
  const [other, setOther] = useState<ProteinInput | null>(initialComparison);
  const [otherChain, setOtherChain] = useState(
    initialComparison?.chains[0].id || ''
  );
  const [ready, setReady] = useState<Ready | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState('');
  const [active, setActive] = useState<number | null>(null);
  const fileOperation = useRef(0);
  const chartHost = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(640);
  useEffect(
    () => () => {
      fileOperation.current++;
    },
    []
  );
  // Ignore a stale worker result immediately, even before effect cleanup runs.
  const result =
    ready?.primary === input &&
    ready?.comparison === other &&
    ready?.chain === chain &&
    ready?.otherChain === otherChain
      ? ready.result
      : null;
  useEffect(() => {
    setReady(null);
    setActive(null);
    setError('');
    if (!other) {
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
        }>
      ) => {
        if (disposed) return;
        setLoading('');
        if (event.data.error) setError(event.data.error);
        else if (event.data.result)
          setReady({
            primary: input,
            comparison: other,
            chain,
            otherChain,
            result: event.data.result,
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
  }, [input, chain, other, otherChain]);
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
        ? comparisonReport(input, other, result, reference, mapping)
        : null,
    [input, other, result, reference, mapping]
  );
  useEffect(() => {
    onReport(report);
    return () => onReport(null);
  }, [report, onReport]);
  const upload = async (file?: File) => {
    if (!file) return;
    const operation = ++fileOperation.current;
    setOther(null);
    setReady(null);
    setError('');
    setLoading('Opening Comparison Structure…');
    try {
      if (file.size > ANNOTATION_LIMITS.bytes)
        throw new Error('Choose a comparison structure up to 5 MB.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer()
      );
      if (operation !== fileOperation.current) return;
      const next = parseProteinStructure(text, file.name);
      setOther(next);
      setOtherChain(next.chains[0].id);
    } catch (e) {
      if (operation === fileOperation.current) {
        setError(
          e instanceof Error
            ? e.message
            : 'The comparison structure could not be opened.'
        );
        setLoading('');
      }
    }
  };
  const download = (data: string, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const current = result?.pairs[active ?? 0];
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
      <div className={styles.mode}>
        <button
          type="button"
          aria-pressed={!enabled}
          onClick={() => setEnabled(false)}
        >
          Annotation View
        </button>
        <button
          type="button"
          aria-pressed={enabled}
          onClick={() => setEnabled(true)}
        >
          Compare Structures
        </button>
      </div>
      {enabled && (
        <div className={styles.setup}>
          <h3>Compare Two Conformations</h3>
          <p>
            Align another structure to the selected primary chain. Explore which
            residues move and inspect their reference annotations.
          </p>
          <label>
            Comparison Structure
            <input
              type="file"
              accept=".pdb,.cif,.mmcif"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <p className={styles.note}>
            PDB Or mmCIF · Up To 5 MB · Calculated On Your Device
          </p>
          {other && (
            <>
              <p className={styles.names}>
                <strong>Primary:</strong> {input.name} · Chain{' '}
                {chain || 'Unnamed'}
                <br />
                <strong>Comparison:</strong> {other.name}
              </p>
              <div className={styles.controls}>
                <label>
                  Comparison Chain
                  <select
                    value={otherChain}
                    onChange={(e) => setOtherChain(e.target.value)}
                  >
                    {other.chains.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id || 'Unnamed'} · {c.residues.length} Residues
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    fileOperation.current++;
                    setOther(null);
                    setReady(null);
                    setError('');
                    setLoading('');
                  }}
                >
                  Remove Comparison
                </button>
              </div>
            </>
          )}
          {loading && <p role="status">{loading}</p>}
          {error && (
            <p role="alert" className={styles.warning}>
              {error}
            </p>
          )}
        </div>
      )}
      {enabled && result && other ? (
        <>
          <div className={styles.metrics} aria-label="Comparison Metrics">
            <div>
              <strong>
                {result.rmsd.toFixed(2)} <small>Å</small>
              </strong>
              <span>Alpha Carbon RMSD</span>
            </div>
            <div>
              <strong>{result.pairs.length}</strong>
              <span>Paired Residues</span>
            </div>
            <div>
              <strong>{Math.round(result.identity * 100)}%</strong>
              <span>Sequence Identity</span>
            </div>
          </div>
          <p className={styles.coverage}>
            Primary Coverage {Math.round(result.primaryCoverage * 100)}% ·
            Comparison Coverage {Math.round(result.comparisonCoverage * 100)}% ·{' '}
            {result.substitutions} Substitutions
          </p>
          <ProteinComparisonViewer
            primary={input}
            comparison={other}
            result={result}
            selected={selected}
            active={active}
            onActive={setActive}
            onPick={onPick}
            reference={reference}
            mapping={mapping}
            focus={focus}
          />
          <div ref={chartHost} className={styles.chartPanel}>
            <h3>Residue Differences</h3>
            <p className={styles.note}>
              Hover to highlight both structures. Click to select a primary
              residue and see its annotations. The slider also supports keyboard
              selection.
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
                onPick(
                  result.pairs[index].primary.key,
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
                selected.has(p.primary.key) ? (
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
                {result.pairs[0].primary.number}
              </text>
              <text x={w - right} y={h - 19} textAnchor="end">
                {result.pairs[count - 1].primary.number}
              </text>
              <text x={w / 2} y={h - 2} textAnchor="middle">
                Primary Residues In Aligned Order
              </text>
            </svg>
            <label>
              Compared Residue
              <input
                type="range"
                min={1}
                max={count}
                value={(active ?? 0) + 1}
                aria-valuetext={
                  current
                    ? `${current.primary.name} ${current.primary.number}; ${current.distance.toFixed(2)} angstroms`
                    : undefined
                }
                onChange={(e) => {
                  const index = Number(e.target.value) - 1;
                  setActive(index);
                  onPick(result.pairs[index].primary.key, false);
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
                onPick(result.pairs[i].primary.key, false);
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
            <p>{COMPARISON_METHOD}</p>
            <p>
              Correspondence requires at least 90% sequence identity and
              coverage of the shorter observed chain, with no equally scoring
              alternative alignment. Both coverage figures above refer to
              residues with coordinates, not the full biological sequence.
            </p>
            <p>
              Unpaired residues are gray and excluded from RMSD. Distance colors
              describe coordinate differences, not confidence or functional
              significance. Reference annotations remain attached to the primary
              protein.
            </p>
          </details>
        </>
      ) : (
        children
      )}
    </div>
  );
}
