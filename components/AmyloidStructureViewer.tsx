import { useEffect, useRef, useState } from 'react';
import {
  loadMolecularViewer,
  type MolecularViewer,
} from '../lib/molecular-viewer';
import type { Inspection } from '../lib/amyloid-inspector';
import styles from '../styles/Tools.module.css';

type Model = { selectedAtoms: (selection: object) => { chain?: string }[] };
const colors = [
  '#96f4ca',
  '#84cbf4',
  '#c2aff5',
  '#f3c58d',
  '#f0a7ba',
  '#d6eb9b',
];
export default function AmyloidStructureViewer({
  structure,
  reportAvailable = true,
}: {
  structure: NonNullable<Inspection['structure']>;
  reportAvailable?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<MolecularViewer | null>(null);
  const initialView = useRef<number[]>([]);
  const [state, setState] = useState('loading');
  const [representation, setRepresentation] = useState('Cartoon');
  const [chains, setChains] = useState<string[]>([]);
  const [chain, setChain] = useState('all');
  useEffect(() => {
    if (!host.current || structure.modelIndex !== 0) return;
    const element = host.current;
    let disposed = false;
    let scene: MolecularViewer | null = null;
    let resize: ResizeObserver | undefined;
    const lost = (event: Event) => {
      event.preventDefault();
      setState('unavailable');
    };
    element.addEventListener('webglcontextlost', lost, true);
    void loadMolecularViewer()
      .then((library) => {
        if (disposed) return;
        scene = library.createViewer(element, {
          backgroundColor: '#0c0c0c',
          antialias: true,
          cartoonQuality: 8,
        });
        viewer.current = scene;
        const model = scene.addModel(structure.text, structure.format, {
          keepH: false,
          doAssembly: false,
        }) as Model;
        const atoms = model.selectedAtoms({});
        if (!atoms.length) throw new Error('No atoms');
        const ids = [...new Set(atoms.map((atom) => atom.chain || ''))];
        setChains(ids);
        scene.setProjection('orthographic');
        ids.forEach((id, index) =>
          scene?.setStyle(
            { chain: id },
            {
              cartoon: { color: colors[index % colors.length], arrows: true },
              line: { color: colors[index % colors.length], opacity: 0.15 },
            }
          )
        );
        scene.zoomTo();
        scene.rotate(20, 'y');
        scene.rotate(-15, 'x');
        scene.zoom(1.5);
        initialView.current = scene.getView();
        scene.render();
        resize = new ResizeObserver(() => {
          scene?.resize();
        });
        resize.observe(element);
        setState('ready');
      })
      .catch(() => {
        if (!disposed) {
          setState('unavailable');
          scene?.destroy();
          viewer.current = null;
          element.replaceChildren();
        }
      });
    return () => {
      disposed = true;
      resize?.disconnect();
      element.removeEventListener('webglcontextlost', lost, true);
      scene?.destroy();
      viewer.current = null;
      element.replaceChildren();
    };
  }, [structure]);
  useEffect(() => {
    const scene = viewer.current;
    if (state !== 'ready' || !scene) return;
    scene.setStyle({}, {});
    chains.forEach((id, index) => {
      if (chain !== 'all' && chain !== id) return;
      const color = colors[index % colors.length];
      scene.setStyle(
        { chain: id },
        representation === 'Cartoon'
          ? { cartoon: { color, arrows: true }, line: { color, opacity: 0.15 } }
          : { stick: { colorscheme: 'Jmol', radius: 0.14 } }
      );
    });
    scene.render();
  }, [representation, chains, chain, state]);
  const act = (kind: string) => {
    const scene = viewer.current;
    if (!scene) return;
    if (kind === 'reset') {
      setChain('all');
      scene.setView(initialView.current);
    } else if (kind === 'left' || kind === 'right')
      scene.rotate(kind === 'left' ? -20 : 20, 'y');
    else scene.zoom(kind === 'in' ? 1.2 : 0.8);
    scene.render();
  };
  if (structure.modelIndex !== 0)
    return (
      <div className={styles.empty}>
        This report uses model index {structure.modelIndex}. This viewer
        currently displays only model index 0. Open the verified structure in
        your molecular software to inspect that model; the report remains
        available below.
      </div>
    );
  return (
    <div className={styles.viewer} data-viewer={state}>
      <div
        className={styles.canvas}
        ref={host}
        role="img"
        aria-label={`Molecular structure from ${structure.name}. Chains have distinct colors in cartoon view.`}
      />
      {state !== 'ready' && (
        <p className={styles.viewerMessage} role="status">
          {state === 'loading'
            ? 'Opening The Structure…'
            : reportAvailable
              ? '3D rendering is unavailable in this browser. The report and descriptors remain available.'
              : '3D rendering is unavailable in this browser. Try a browser with WebGL enabled.'}
        </p>
      )}
      <div className={styles.viewerControls}>
        <label>
          Representation
          <select
            value={representation}
            disabled={state !== 'ready'}
            onChange={(e) => setRepresentation(e.target.value)}
          >
            <option>Cartoon</option>
            <option>Sticks</option>
          </select>
        </label>
        <label>
          Chain
          <select
            value={chain}
            disabled={state !== 'ready'}
            onChange={(e) => setChain(e.target.value)}
          >
            <option value="all">All Chains</option>
            {chains.map((id) => (
              <option key={id} value={id}>
                {id || 'Unnamed Chain'}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.controls}>
          <button
            disabled={state !== 'ready'}
            onClick={() => act('left')}
            aria-label="Rotate Left"
          >
            ↶
          </button>
          <button
            disabled={state !== 'ready'}
            onClick={() => act('right')}
            aria-label="Rotate Right"
          >
            ↷
          </button>
          <button
            disabled={state !== 'ready'}
            onClick={() => act('in')}
            aria-label="Zoom In"
          >
            +
          </button>
          <button
            disabled={state !== 'ready'}
            onClick={() => act('out')}
            aria-label="Zoom Out"
          >
            −
          </button>
          <button disabled={state !== 'ready'} onClick={() => act('reset')}>
            Reset View
          </button>
        </div>
      </div>
      <p className={styles.caption}>
        Drag to rotate · Scroll to zoom · Colors identify chains, not
        confidence.{' '}
        {reportAvailable
          ? 'Warnings describe the assembly; this view does not localize them to residues.'
          : 'Showing the first coordinate model. No amyloid assessment has been calculated.'}
      </p>
    </div>
  );
}
