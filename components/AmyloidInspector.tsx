import { useEffect, useRef, useState } from 'react';
import {
  inspectFiles,
  readStructure,
  metrics,
  numberOrNull,
  reviewExport,
  titleCase,
  warningItems,
  MAX_FILE_BYTES,
  type Inspection,
} from '../lib/amyloid-inspector';
import AmyloidStructureViewer from './AmyloidStructureViewer';
import AmyloidBatchAnalysis from './AmyloidBatchAnalysis';
import styles from '../styles/Tools.module.css';

export default function AmyloidInspector() {
  const [mode, setMode] = useState('analysis');
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [structurePreview, setStructurePreview] = useState<NonNullable<
    Inspection['structure']
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [example, setExample] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  async function open(files?: File[], demo?: string) {
    const id = ++operation.current;
    setBusy(true);
    setError('');
    setInspection(null);
    setStructurePreview(null);
    setExample('');
    try {
      let selected: File[];
      if (demo) {
        selected = await Promise.all(
          ['gates.json', 'manifest.json', 'pdb'].map(async (suffix) => {
            const name = `${demo}.${suffix}`;
            const response = await fetch(`/tools/amyloid-example/${name}`);
            if (!response.ok)
              throw new Error('The example could not be loaded. Try again.');
            return new File([await response.arrayBuffer()], name);
          })
        );
      } else selected = files || [];
      if (
        selected.length > 3 ||
        selected.some((file) => file.size > MAX_FILE_BYTES) ||
        selected.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024
      )
        throw new Error(
          'Select up to three files, 25 MB per file and 50 MB total.'
        );
      const inputs = await Promise.all(
        selected.map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        }))
      );
      if (inputs.length === 1 && /\.(pdb|cif|mmcif)$/i.test(inputs[0].name)) {
        const structure = await readStructure(inputs[0]);
        if (id === operation.current) setStructurePreview(structure);
      } else {
        const result = await inspectFiles(inputs);
        if (id === operation.current) {
          setInspection(result);
          setExample(demo || '');
        }
      }
    } catch (problem) {
      if (id === operation.current)
        setError(
          problem instanceof Error
            ? problem.message
            : 'The files could not be opened.'
        );
    } finally {
      if (id === operation.current) setBusy(false);
    }
  }
  function clear() {
    ++operation.current;
    setInspection(null);
    setStructurePreview(null);
    setExample('');
    setBusy(false);
    setError('');
    if (input.current) input.current.value = '';
  }
  function download() {
    if (!inspection) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(reviewExport(inspection), null, 2)], {
        type: 'application/json',
      })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'amyloid-review.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const report = inspection?.report;
  const warnings = report ? warningItems(report) : [];
  const measurements = report?.quality_gate.measurements;
  return (
    <section
      className={styles.inspector}
      aria-label="Amyloid Report Inspector"
      aria-busy={busy}
    >
      <div
        className={styles.modeTabs}
        role="group"
        aria-label="Choose An Analysis Mode"
      >
        <button
          aria-pressed={mode === 'analysis'}
          onClick={() => {
            setMode('analysis');
            clear();
          }}
        >
          Analyze Structures
        </button>
        <button
          aria-pressed={mode === 'reports'}
          onClick={() => {
            setMode('reports');
            clear();
          }}
        >
          Open Existing Reports
        </button>
      </div>
      <div hidden={mode !== 'analysis'}>
        <AmyloidBatchAnalysis
          onReset={clear}
          onPreview={(structure) => {
            setInspection(null);
            setStructurePreview(structure);
            setExample('');
          }}
          onInspect={(result) => {
            setStructurePreview(null);
            setInspection(result);
            setExample('');
          }}
        />
      </div>
      {mode === 'reports' && (
        <>
          <div className={styles.upload}>
            <div>
              <p className={styles.kicker}>01 / Open A Structure Or Result</p>
              <h2>Bring Your Assembly Into Focus.</h2>
              <p>
                Open a PDB or mmCIF file to explore its structure. To see
                calculated warnings and descriptors, select the structure
                together with its <code>.gates.json</code> report and{' '}
                <code>.manifest.json</code>.
              </p>
            </div>
            <div className={styles.uploadActions}>
              <label htmlFor="amyloid-files">
                Choose Structure Or Report Files
              </label>
              <input
                ref={input}
                id="amyloid-files"
                type="file"
                accept=".json,.pdb,.cif,.mmcif"
                multiple
                disabled={!ready || busy}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length) void open(files);
                  e.target.value = '';
                }}
              />
              <p>Up to 3 files · 25 MB each · 50 MB total</p>
            </div>
          </div>
          <p className={styles.caption}>
            Report files and local previews stay in your browser. No analysis is
            submitted in this mode.
          </p>
        </>
      )}
      <div className={styles.exampleBar}>
        <span>Try A Calculated Example</span>
        <button
          disabled={!ready || busy}
          onClick={() => void open(undefined, '6qjh')}
        >
          6QJH / Geometry Warning ↗
        </button>
        <button
          disabled={!ready || busy}
          onClick={() => void open(undefined, '2beg')}
        >
          2BEG / High Support ↗
        </button>
      </div>

      {!ready && (
        <>
          <p className={styles.notice}>
            Enable JavaScript to open reports and render structures. The package
            instructions below also work independently of this viewer.
          </p>
        </>
      )}
      {busy && <p role="status">Reading Files And Checking SHA-256…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {structurePreview && (
        <div className={styles.results}>
          <div className={styles.resultHeading}>
            <div>
              <p className={styles.kicker}>02 / Structure Preview</p>
              <h2>{structurePreview.name}</h2>
            </div>
            <div className={styles.controls}>
              <button onClick={clear}>Clear Files</button>
            </div>
          </div>
          <div className={styles.workbench}>
            <section
              className={styles.structurePanel}
              aria-label="Structure Inspection"
            >
              <div className={styles.panelHeader}>
                <h3>Structure</h3>
                <span className={styles.badge}>Structure Only</span>
              </div>
              <AmyloidStructureViewer
                key={structurePreview.sha256}
                structure={structurePreview}
                reportAvailable={false}
              />
            </section>
            <section
              className={styles.warningPanel}
              aria-labelledby="preview-warning-title"
            >
              <div className={styles.panelHeader}>
                <h3 id="preview-warning-title">Analysis Not Yet Calculated</h3>
              </div>
              <div className={styles.notice}>
                <p>
                  Your structure is ready to explore. Rotate it, inspect
                  individual chains, or switch between cartoon and stick views.
                </p>
                <p>
                  A PDB contains coordinates; the amyloid warning and descriptor
                  calculations come from the Python package. No scores or
                  warning results have been calculated for this preview.
                </p>
                <button
                  className={styles.primary}
                  onClick={() => setMode('analysis')}
                >
                  Analyze Structures ↑
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
      {report && inspection && (
        <div className={styles.results}>
          <div className={styles.resultHeading}>
            <div>
              <p className={styles.kicker}>02 / Package Interpretation</p>
              <h2>
                {titleCase(report.positive_reference_gates.classification)}
              </h2>
              <p className={styles.identity}>{report.prediction_id}</p>
            </div>
            <div className={styles.controls}>
              <button onClick={download}>Export Review</button>
              <button onClick={clear}>Clear Files</button>
            </div>
          </div>
          {example && (
            <p className={styles.notice}>
              Public package example:{' '}
              {example === '6qjh'
                ? 'Boltz-2 prediction for target 6QJH'
                : 'ESMFold2 prediction for target 2BEG'}
              . These are predicted coordinates, not the experimental structure.{' '}
              <a href={`/tools/amyloid-example/${example}.gates.json`} download>
                Report
              </a>{' '}
              ·{' '}
              <a
                href={`/tools/amyloid-example/${example}.manifest.json`}
                download
              >
                Manifest
              </a>{' '}
              ·{' '}
              <a href={`/tools/amyloid-example/${example}.pdb`} download>
                Structure
              </a>
            </p>
          )}
          <div className={styles.workbench}>
            <section
              className={styles.structurePanel}
              aria-label="Structure Inspection"
            >
              <div className={styles.panelHeader}>
                <h3>Structure</h3>
                <span className={styles.badge}>
                  {inspection.structure ? 'SHA-256 Matched' : 'Report Only'}
                </span>
              </div>
              {inspection.structure ? (
                <AmyloidStructureViewer
                  key={inspection.structure.sha256 + inspection.reportHash}
                  structure={inspection.structure}
                />
              ) : (
                <div className={styles.empty}>
                  <span aria-hidden="true">⌬</span>
                  <h3>No Linked Structure</h3>
                  <p>
                    Choose the report, its manifest, and the original structure
                    together to verify the file pairing and open the 3D view.
                  </p>
                </div>
              )}
            </section>
            <section
              className={styles.warningPanel}
              aria-labelledby="warnings-title"
            >
              <div className={styles.panelHeader}>
                <h3 id="warnings-title">Warnings & Eligibility</h3>
                <span className={styles.badge}>{warnings.length} Findings</span>
              </div>
              <p className={styles.qc}>
                Quality Gate:{' '}
                <strong>{titleCase(report.quality_gate.qc_status)}</strong>
                <br />
                {titleCase(report.quality_gate.assessability)}
              </p>
              {warnings.length ? (
                <div className={styles.warningList}>
                  {warnings.map((warning, index) => (
                    <details key={warning.code} open={index === 0}>
                      <summary>{warning.title}</summary>
                      <p className={styles.kicker}>
                        {warning.sources.join(' · ')}
                      </p>
                      <p>{warning.description}</p>
                      <p>
                        <strong>What To Check</strong>
                        <br />
                        {warning.next}
                      </p>
                      <code>{warning.code}</code>
                    </details>
                  ))}
                </div>
              ) : (
                <p className={styles.notice}>
                  No warnings were reported by these gates. This is not
                  experimental confirmation of the assembly.
                </p>
              )}
            </section>
          </div>
          <div className={styles.metricGrid}>
            {metrics(report).map((metric) => (
              <article key={metric.symbol} className={styles.metric}>
                <p className={styles.kicker}>{metric.label}</p>
                <strong className={styles.metricValue}>
                  {metric.value === null
                    ? 'Unavailable'
                    : metric.value.toFixed(3)}
                </strong>
                <span className={styles.badge}>
                  {metric.value === null
                    ? 'Unavailable'
                    : !report.quality_gate.passed || !metric.eligible
                      ? 'Not Eligible For Interpretation'
                      : titleCase(metric.state)}
                </span>
                <p>{metric.detail}</p>
                <code>{metric.symbol}</code>
              </article>
            ))}
          </div>
          <details className={styles.provenance}>
            <summary>Measurements & File Provenance</summary>
            <dl>
              {[
                ['Packing Repeat', report.packing_repeat_score],
                [
                  'Intrachain Core',
                  report.soluble_intrachain_core.N_soluble_core,
                ],
                ['Coordinate Coverage', measurements?.coordinate_coverage],
                ['Severe Clashes', measurements?.severe_clash_count],
                [
                  'Catastrophic Clashes',
                  measurements?.catastrophic_clash_count,
                ],
                [
                  'Axial Rise (Å)',
                  report.component_features.geometry.axial_rise_A,
                ],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt>{String(label)}</dt>
                  <dd>
                    {numberOrNull(value) === null
                      ? 'Unavailable'
                      : Number(value).toLocaleString('en-US', {
                          maximumFractionDigits: 4,
                        })}
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              Reference:{' '}
              <code>{report.positive_reference_gates.reference_source}</code>
            </p>
            <p>
              Schema: <code>{report.schema_version}</code>
            </p>
            <p>
              Report SHA-256: <code>{inspection.reportHash}</code>
            </p>
            <p>
              Manifest SHA-256:{' '}
              <code>{inspection.manifestHash || 'Not Provided'}</code>
            </p>
            <p>
              Structure SHA-256:{' '}
              <code>{inspection.structure?.sha256 || 'Not Provided'}</code>
            </p>
            <p>
              Matching hashes establish file consistency, not scientific
              validity. Scores and classifications are reported by the supplied
              package output.
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
