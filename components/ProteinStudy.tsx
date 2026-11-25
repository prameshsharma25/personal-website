import { useEffect, useId, useRef, useState } from 'react';
import structures from '../data/rfah.json';
import { loadMolecularViewer, type MolecularViewer } from '../lib/molecular-viewer';
import styles from '../styles/ProteinStudy.module.css';
type Fold = keyof typeof structures;

export default function ProteinStudy() {
  const [fold, setFold] = useState<Fold>('alpha');
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const [spinning, setSpinning] = useState(true), [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false), [tabVisible, setTabVisible] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadedFold, setLoadedFold] = useState<Fold | null>(null);
  const viewport = useRef<HTMLDivElement>(null), viewer = useRef<MolecularViewer | null>(null);
  const initialView = useRef<number[]>([]), cache = useRef<Partial<Record<Fold, string>>>({});
  const id = useId(), structure = structures[fold];
  const displayReady = ready && !loading && !failed && loadedFold === fold;

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(preference.matches);
    const visibility = () => setTabVisible(!document.hidden);
    change(); visibility(); preference.addEventListener('change', change); document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver(entries => setInView(entries[0].isIntersecting), { threshold: .1 });
    if (viewport.current) observer.observe(viewport.current);
    return () => { observer.disconnect(); preference.removeEventListener('change', change); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  useEffect(() => {
    if (!inView || ready || failed || !viewport.current) return;
    let cancelled = false;
    // Yield to the initial text/font paint. No external requests are needed.
    const timer = setTimeout(() => {
      void loadMolecularViewer().then(library => {
        if (cancelled || !viewport.current) return;
        try {
          viewer.current = library.createViewer(viewport.current, { backgroundColor: '#061012', backgroundAlpha: 0, antialias: true, cartoonQuality: 8, disableFog: true });
          viewer.current.setProjection('orthographic'); setReady(true);
        } catch { setFailed(true); }
      }).catch(() => { if (!cancelled) setFailed(true); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [inView, ready, failed]);

  useEffect(() => () => { viewer.current?.destroy(); viewer.current = null; }, []);

  useEffect(() => {
    if (!ready || !viewer.current) return;
    let cancelled = false; const controller = new AbortController(); setLoading(true);
    async function show() {
      try {
        let pdb = cache.current[fold];
        if (!pdb) {
          const response = await fetch(structure.file, { signal: controller.signal });
          if (!response.ok) throw new Error('Structure unavailable');
          pdb = await response.text();
          if (!pdb.includes('ATOM')) throw new Error('Structure unavailable');
          cache.current[fold] = pdb;
        }
        if (cancelled || !viewer.current) return;
        const scene = viewer.current;
        scene.spin(false); scene.removeAllModels(); scene.addModel(pdb, 'pdb', { keepH: false });
        scene.setStyle({}, { cartoon: { color: fold === 'alpha' ? '#91ffcf' : '#6edbff', thickness: .45, arrows: true } });
        scene.zoomTo(); scene.rotate(45, 'y'); scene.rotate(25, 'x'); scene.zoom(1.05); scene.render();
        initialView.current = scene.getView(); setLoadedFold(fold); setLoading(false);
      } catch { if (!cancelled) { setFailed(true); setLoading(false); } }
    }
    void show();
    return () => { cancelled = true; controller.abort(); };
  }, [fold, ready, structure.file]);

  useEffect(() => {
    viewer.current?.spin(spinning && !reduced && inView && tabVisible && displayReady ? 'vy' : false, .35);
  }, [spinning, reduced, inView, tabVisible, displayReady]);

  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(() => viewer.current?.resize()); observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);

  function rotate(angle: number) { setSpinning(false); viewer.current?.rotate(angle, 'vy'); viewer.current?.render(); }
  function reset() { setSpinning(false); if (initialView.current.length) viewer.current?.setView(initialView.current); }
  return <figure className={styles.study} data-fold={fold} data-rendered-fold={loadedFold ?? undefined} data-viewer={failed ? 'fallback' : displayReady ? 'ready' : 'loading'} data-spinning={spinning && !reduced && inView && tabVisible && displayReady}>
    <header className={styles.header}><span className={styles.liveDot} aria-hidden="true" /><span>MOLECULAR EXPLORER</span><span className={styles.proteinName}>RfaH</span></header>
    <div className={styles.switcher} role="group" aria-label="Choose RfaH structure">
      <button type="button" aria-pressed={fold === 'alpha'} onClick={() => setFold('alpha')}><span>01</span> α-helical state</button>
      <button type="button" aria-pressed={fold === 'beta'} onClick={() => setFold('beta')}><span>02</span> β-barrel state</button>
    </div>
    <div className={styles.stage}>
      <div className={styles.orbit} aria-hidden="true" />
      <div ref={viewport} className={styles.canvas} role="img" aria-hidden={!displayReady} aria-label={`3D structure of the RfaH C-terminal domain: ${structure.label}, PDB ${structure.pdb}`} />
      {!displayReady && <svg className={styles.fallback} viewBox="0 0 420 350" role="img" aria-labelledby={`${id}-title`}><title id={`${id}-title`}>RfaH {structure.label}: backbone trace from {structure.pdb}</title><path d={structure.previewPath} fill="none" stroke={fold === 'alpha' ? '#91ffcf' : '#6edbff'} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" /></svg>}
      <div className={styles.scan} key={fold} aria-hidden="true" />
      <span className={styles.structureTag}>{structure.pdb} / CHAIN A</span>
      <span className={styles.stageHint}>{failed ? 'Backbone preview' : displayReady ? 'Drag to rotate · scroll to zoom' : 'Experimental structure'}</span>
    </div>
    <div className={styles.controls} aria-label="Structure controls">
      <button type="button" disabled={!displayReady || reduced} onClick={() => setSpinning(!spinning)} aria-pressed={spinning && !reduced}>{reduced ? 'Rotation paused' : spinning ? 'Pause rotation' : 'Auto-rotate'}</button>
      <button type="button" disabled={!displayReady} aria-label="Rotate structure left" onClick={() => rotate(-25)}>↶</button>
      <button type="button" disabled={!displayReady} aria-label="Rotate structure right" onClick={() => rotate(25)}>↷</button>
      <button type="button" disabled={!displayReady} aria-label="Zoom in" onClick={() => { viewer.current?.zoom(1.2); viewer.current?.render(); }}>+</button>
      <button type="button" disabled={!displayReady} aria-label="Zoom out" onClick={() => { viewer.current?.zoom(.8); viewer.current?.render(); }}>−</button>
      <button type="button" disabled={!displayReady} onClick={reset}>Reset view</button>
    </div>
    <figcaption className={styles.description}><strong>One protein. Two folds.</strong><p>RfaH’s C-terminal domain can form an α-helical hairpin or a β-barrel.</p><p className={styles.stateLabel} aria-live="polite">{structure.label} · {structure.method}</p></figcaption>
    <details className={styles.details}><summary>Structures &amp; sources</summary><p>Deposited coordinates from <a href="https://www.rcsb.org/structure/2OUG" target="_blank" rel="noreferrer">2OUG</a> (α: chain A, residues 115–156) and <a href="https://www.rcsb.org/structure/2LCL" target="_blank" rel="noreferrer">2LCL</a> (β: chain A, residues 115–162, NMR model 1 of 20).</p><p>The α state is cropped from full-length RfaH; the β state was determined for the isolated domain. Unresolved crystal residues are omitted. Switching views compares structures; it does not simulate a folding pathway.</p><p><a href={structure.file} download>Download the displayed coordinates</a> · <a href="https://doi.org/10.1016/j.cell.2012.05.042" target="_blank" rel="noreferrer">Read the study</a> · Rendering by <a href="https://3dmol.org" target="_blank" rel="noreferrer">3Dmol.js</a></p></details>
  </figure>;
}
