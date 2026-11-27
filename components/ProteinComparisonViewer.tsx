import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  loadMolecularViewer,
  type MolecularViewer,
} from '../lib/molecular-viewer';
import {
  comparisonPdb,
  type ProteinComparisonResult,
} from '../lib/protein-comparison';
import type {
  Mapping,
  ProteinInput,
  ReferenceProtein,
  Residue,
} from '../lib/protein-annotations';
import { residuePreview } from '../lib/protein-hover';
import styles from '../styles/ProteinComparison.module.css';

type Atom = { model: number; chain: string; resi: number };
type Viewer = MolecularViewer & {
  addStyle(selection: object, style: object): void;
  setHover(atom: Atom | null): void;
  setClickable(
    selection: object,
    enabled: boolean,
    callback: (atom: Atom, viewer: unknown, event: MouseEvent) => void
  ): void;
  setHoverable(
    selection: object,
    enabled: boolean,
    enter: (atom: Atom) => void,
    leave: () => void
  ): void;
  pngURI(): string;
};
export default function ProteinComparisonViewer({
  primary,
  comparison,
  result,
  selected,
  active,
  onActive,
  onPick,
  reference,
  mapping,
  focus,
}: {
  primary: ProteinInput;
  comparison: ProteinInput;
  result: ProteinComparisonResult;
  selected: Set<string>;
  active: number | null;
  onActive: (index: number | null) => void;
  onPick: (key: string, add: boolean) => void;
  reference: ReferenceProtein | null;
  mapping: Mapping | null;
  focus: number;
}) {
  const host = useRef<HTMLDivElement>(null),
    viewer = useRef<Viewer>(null);
  const callbacks = useRef({ onActive, onPick });
  callbacks.current = { onActive, onPick };
  const [state, setState] = useState('loading'),
    [error, setError] = useState('');
  const [color, setColor] = useState('Structure'),
    [visible, setVisible] = useState('Both');
  const [hover, setHover] = useState<{
    residue: Residue;
    model: number;
    pair: number;
  } | null>(null);
  const lookup = useMemo(() => {
    const map = new Map<
      string,
      { residue: Residue; model: number; pair: number }
    >();
    [
      primary.chains.find((c) => c.id === result.primaryChain),
      comparison.chains.find((c) => c.id === result.comparisonChain),
    ].forEach((c, model) => {
      for (const residue of c.residues)
        map.set(`${model}:${residue.viewerChain}:${residue.viewerPosition}`, {
          residue,
          model,
          pair: result.pairs.findIndex(
            (p) => (model ? p.comparison : p.primary).key === residue.key
          ),
        });
    });
    return map;
  }, [primary, comparison, result]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false,
      scene: Viewer,
      resize: ResizeObserver;
    setState('loading');
    setError('');
    setHover(null);
    const lost = (event: Event) => {
      event.preventDefault();
      setState('unavailable');
      setError(
        '3D rendering is unavailable. The difference chart and report still work.'
      );
    };
    element.addEventListener('webglcontextlost', lost, true);
    void loadMolecularViewer()
      .then((library) => {
        if (disposed) return;
        scene = library.createViewer(element, {
          backgroundColor: '#06101e',
          antialias: true,
          hoverDuration: 0,
        }) as Viewer;
        viewer.current = scene;
        scene.addModel(comparisonPdb(primary, result.primaryChain), 'pdb');
        scene.addModel(
          comparisonPdb(comparison, result.comparisonChain, result.transform),
          'pdb'
        );
        scene.setClickable({}, true, (atom, _, event) => {
          const hit = lookup.get(`${atom.model}:${atom.chain}:${atom.resi}`);
          if (hit?.pair >= 0)
            callbacks.current.onPick(
              result.pairs[hit.pair].primary.key,
              Boolean(event?.shiftKey || event?.ctrlKey || event?.metaKey)
            );
          else if (hit?.model === 0)
            callbacks.current.onPick(hit.residue.key, Boolean(event?.shiftKey));
        });
        scene.setHoverable(
          {},
          true,
          (atom) => {
            if (disposed) return;
            const hit =
              lookup.get(`${atom.model}:${atom.chain}:${atom.resi}`) || null;
            setHover(hit);
            callbacks.current.onActive(hit?.pair >= 0 ? hit.pair : null);
          },
          () => {
            setHover(null);
            callbacks.current.onActive(null);
          }
        );
        scene.setStyle(
          { model: 0 },
          {
            cartoon: { color: '#73c5ff' },
            line: { color: '#73c5ff', opacity: 0.15 },
          }
        );
        scene.setStyle(
          { model: 1 },
          {
            cartoon: { color: '#f6a66a' },
            line: { color: '#f6a66a', opacity: 0.15 },
          }
        );
        scene.setProjection('orthographic');
        scene.zoomTo();
        scene.zoom(1.4);
        scene.render();
        resize = new ResizeObserver(() => scene.resize());
        resize.observe(element);
        setState('ready');
      })
      .catch((e) => {
        if (disposed) return;
        setState('unavailable');
        setError(
          e instanceof Error
            ? e.message
            : '3D rendering is unavailable. The difference chart and report still work.'
        );
        resize?.disconnect();
        scene?.destroy();
        viewer.current = null;
        element.replaceChildren();
      });
    return () => {
      disposed = true;
      resize?.disconnect();
      scene?.destroy();
      viewer.current = null;
      element.removeEventListener('webglcontextlost', lost, true);
      element.replaceChildren();
    };
  }, [primary, comparison, result, lookup]);
  useLayoutEffect(() => {
    const scene = viewer.current;
    if (state !== 'ready' || !scene) return;
    scene.setStyle({}, {});
    for (const model of [0, 1]) {
      if (visible !== 'Both' && visible !== (model ? 'Comparison' : 'Primary'))
        continue;
      const colorfunc = (atom: Atom) => {
        const hit = lookup.get(`${model}:${atom.chain}:${atom.resi}`);
        if (hit?.pair == null || hit.pair < 0) return '#7a8799';
        if (color === 'Structure') return model ? '#f6a66a' : '#73c5ff';
        const t =
          result.maxDistance > 1e-8
            ? result.pairs[hit.pair].distance / result.maxDistance
            : 0;
        const rgb = [92 + 163 * t, 188 - 99 * t, 237 - 119 * t].map(Math.round);
        return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      };
      scene.setStyle(
        { model },
        { cartoon: { colorfunc }, line: { colorfunc, opacity: 0.15 } }
      );
      const picked = result.pairs
        .filter((p) => selected.has(p.primary.key))
        .map((p) => (model ? p.comparison : p.primary).viewerPosition);
      if (!model)
        for (const r of primary.chains.find((c) => c.id === result.primaryChain)
          .residues)
          if (selected.has(r.key) && !picked.includes(r.viewerPosition))
            picked.push(r.viewerPosition);
      if (picked.length)
        scene.addStyle(
          { model, resi: picked },
          {
            cartoon: { color: '#ffdc76' },
            stick: { color: '#ffdc76', radius: 0.18 },
          }
        );
      const pair = active != null ? result.pairs[active] : null;
      const residue = pair
        ? model
          ? pair.comparison
          : pair.primary
        : hover?.model === model
          ? hover.residue
          : null;
      if (residue)
        scene.addStyle(
          { model, resi: residue.viewerPosition },
          {
            cartoon: { color: '#f38bff' },
            stick: { color: '#f38bff', radius: 0.23 },
            sphere: { color: '#f38bff', radius: 0.35 },
          }
        );
    }
    scene.render();
  }, [state, visible, color, selected, active, hover, result, lookup, primary]);
  useEffect(() => {
    if (!focus || !viewer.current || state !== 'ready') return;
    const positions = primary.chains
      .find((c) => c.id === result.primaryChain)
      .residues.filter((r) => selected.has(r.key))
      .map((r) => r.viewerPosition);
    viewer.current.zoomTo(
      positions.length ? { model: 0, resi: positions } : {}
    );
    viewer.current.render();
    // Focus only on an explicit request, preserving the camera during selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  const primaryResidue =
    hover?.pair >= 0
      ? result.pairs[hover.pair].primary
      : hover?.model === 0
        ? hover.residue
        : null;
  const preview = primaryResidue
    ? residuePreview(primaryResidue, result.primaryChain, reference, mapping)
    : null;
  return (
    <div data-comparison-viewer={state}>
      <div
        className={styles.viewport}
        onPointerLeave={() => {
          viewer.current?.setHover(null);
          setHover(null);
          callbacks.current.onActive(null);
        }}
        onPointerDown={() => {
          viewer.current?.setHover(null);
          setHover(null);
        }}
      >
        <div
          ref={host}
          className={styles.canvas}
          role="img"
          aria-label="Aligned Protein Structures"
        />
        {state === 'loading' && (
          <p className={styles.overlayMessage} role="status">
            Opening The Overlay…
          </p>
        )}
        {hover && (
          <div role="tooltip" className={styles.tooltip}>
            <strong>
              {hover.model ? 'Comparison' : 'Primary'} · {hover.residue.name}{' '}
              {hover.residue.number} · Chain {hover.residue.chain || 'Unnamed'}
            </strong>
            {hover.pair >= 0 ? (
              <p>
                {result.pairs[hover.pair].distance.toFixed(2)} Å Difference ·
                Click To Select The Corresponding Primary Residue
              </p>
            ) : (
              <p>No paired residue. Excluded from the fit.</p>
            )}
            {preview?.annotations.slice(0, 2).map((a) => (
              <p key={a.id}>
                {a.source} · {a.description || a.category}
              </p>
            ))}
            {hover.model === 1 && preview?.annotations.length > 0 && (
              <small>Annotations refer to the paired primary residue.</small>
            )}
          </div>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className={styles.controls}>
        <label>
          Color By
          <select value={color} onChange={(e) => setColor(e.target.value)}>
            <option>Structure</option>
            <option>Difference</option>
          </select>
        </label>
        <label>
          Visible Structures
          <select
            value={visible}
            onChange={(e) => {
              viewer.current?.setHover(null);
              setHover(null);
              onActive(null);
              setVisible(e.target.value);
            }}
          >
            <option>Both</option>
            <option>Primary</option>
            <option>Comparison</option>
          </select>
        </label>
        <button
          type="button"
          disabled={state !== 'ready'}
          onClick={() => {
            viewer.current?.zoomTo();
            viewer.current?.zoom(1.4);
            viewer.current?.render();
          }}
        >
          Reset Overlay
        </button>
        <button
          type="button"
          disabled={state !== 'ready'}
          onClick={() => {
            try {
              const a = document.createElement('a');
              a.href = viewer.current.pngURI();
              a.download = 'protein-comparison.png';
              a.click();
            } catch {
              setError(
                'The image could not be exported. Try resetting the overlay.'
              );
            }
          }}
        >
          Download Image
        </button>
      </div>
      <p className={styles.legend}>
        {color === 'Structure' ? (
          <>
            <span>● Primary</span> <span>● Comparison</span>
          </>
        ) : (
          <>Difference: Blue 0 Å To Coral {result.maxDistance.toFixed(2)} Å</>
        )}{' '}
        · Gray Unpaired · Gold Selected · Pink Hovered
      </p>
    </div>
  );
}
