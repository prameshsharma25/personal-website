import { useEffect, useRef, useState } from 'react';
import {
  loadMolecularViewer,
  type MolecularViewer,
} from '../lib/molecular-viewer';
import type { ProteinInput, Residue } from '../lib/protein-annotations';
import styles from '../styles/ProteinAnnotations.module.css';
type Atom = { chain: string; resi: number };
type SelectableViewer = MolecularViewer & {
  addStyle: (selection: object, style: object) => void;
  setClickable: (
    selection: object,
    enabled: boolean,
    callback: (atom: Atom, viewer: unknown, event: MouseEvent) => void
  ) => void;
  setHoverable: (
    selection: object,
    enabled: boolean,
    enter: (atom: Atom) => void,
    leave: () => void
  ) => void;
};
export default function AnnotationStructureViewer({
  input,
  chain,
  selected,
  annotated,
  onPick,
  onHover,
  focus,
}: {
  input: ProteinInput;
  chain: string;
  selected: Set<string>;
  annotated: Set<string>;
  onPick: (key: string, add: boolean) => void;
  onHover: (residue: Residue | null) => void;
  focus: number;
}) {
  const host = useRef<HTMLDivElement>(null),
    viewer = useRef<SelectableViewer>(null);
  const callbacks = useRef({ onPick, onHover });
  callbacks.current = { onPick, onHover };
  const [state, setState] = useState('loading'),
    [style, setStyle] = useState('Cartoon');
  useEffect(() => {
    if (!host.current || !input.pdb) return;
    const element = host.current;
    let disposed = false,
      scene: SelectableViewer,
      resize: ResizeObserver;
    setState('loading');
    const lost = (event: Event) => {
      event.preventDefault();
      setState('unavailable');
    };
    element.addEventListener('webglcontextlost', lost, true);
    void loadMolecularViewer()
      .then((library) => {
        if (disposed) return;
        scene = library.createViewer(element, {
          backgroundColor: '#06101e',
          antialias: true,
        }) as SelectableViewer;
        viewer.current = scene;
        scene.addModel(input.pdb, 'pdb', { keepH: false, doAssembly: false });
        const lookup = new Map(
          input.chains.flatMap((c) =>
            c.residues.map(
              (r) => [`${r.viewerChain}:${r.viewerPosition}`, r] as const
            )
          )
        );
        scene.setClickable({}, true, (atom, _, event) => {
          const r = lookup.get(`${atom.chain}:${atom.resi}`);
          if (r)
            callbacks.current.onPick(
              r.key,
              Boolean(event?.shiftKey || event?.ctrlKey || event?.metaKey)
            );
        });
        scene.setHoverable(
          {},
          true,
          (atom) =>
            callbacks.current.onHover(
              lookup.get(`${atom.chain}:${atom.resi}`) || null
            ),
          () => callbacks.current.onHover(null)
        );
        scene.setStyle(
          {},
          {
            cartoon: { color: '#7da5d0' },
            line: { color: '#7da5d0', opacity: 0.18 },
          }
        );
        scene.zoomTo();
        scene.zoom(1.65);
        scene.setProjection('orthographic');
        scene.render();
        resize = new ResizeObserver(() => scene.resize());
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
      scene?.destroy();
      viewer.current = null;
      element.removeEventListener('webglcontextlost', lost, true);
      element.replaceChildren();
    };
  }, [input]);
  useEffect(() => {
    const scene = viewer.current;
    if (state !== 'ready' || !scene) return;
    scene.setStyle({}, {});
    const palette = ['#7fb8ed', '#c2a5ef', '#70d8c2', '#efb579'];
    input.chains.forEach((c, index) => {
      const color = palette[index % palette.length];
      const sel = { chain: c.residues[0].viewerChain };
      scene.setStyle(
        sel,
        style === 'Cartoon'
          ? {
              cartoon: { color, opacity: c.id === chain ? 1 : 0.3 },
              line: { color, opacity: 0.18 },
            }
          : {
              stick: { color, radius: 0.12, opacity: c.id === chain ? 1 : 0.3 },
            }
      );
      const hits = c.residues
        .filter((r) => annotated.has(r.key))
        .map((r) => r.viewerPosition);
      if (hits.length)
        scene.addStyle(
          { ...sel, resi: hits },
          { cartoon: { color: '#60dfd3' } }
        );
      const picks = c.residues
        .filter((r) => selected.has(r.key))
        .map((r) => r.viewerPosition);
      if (picks.length)
        scene.addStyle(
          { ...sel, resi: picks },
          {
            cartoon: { color: '#ffc473' },
            stick: { color: '#ffc473', radius: 0.2 },
          }
        );
    });
    scene.render();
  }, [input, chain, selected, annotated, style, state]);
  useEffect(() => {
    if (!focus || !viewer.current) return;
    const keys = new Set(
      input.chains.flatMap((c) =>
        c.residues
          .filter((r) => selected.has(r.key))
          .map((r) => `${r.viewerChain}:${r.viewerPosition}`)
      )
    );
    viewer.current.zoomTo(
      keys.size
        ? { predicate: (atom: Atom) => keys.has(`${atom.chain}:${atom.resi}`) }
        : {}
    );
    viewer.current.render();
    // Focus changes only when the user requests it; selection itself preserves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  return (
    <div className={styles.structure} data-annotation-viewer={state}>
      <div
        ref={host}
        className={styles.canvas}
        role="img"
        aria-label={`Interactive protein structure: ${input.name}`}
      />
      {state !== 'ready' && (
        <p role="status" className={styles.viewerMessage}>
          {state === 'loading'
            ? 'Opening The Structure…'
            : '3D rendering is unavailable. Sequence selection and annotations still work.'}
        </p>
      )}
      <div className={styles.viewerToolbar}>
        <label>
          Representation
          <select value={style} onChange={(e) => setStyle(e.target.value)}>
            <option>Cartoon</option>
            <option>Sticks</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            viewer.current?.zoomTo();
            viewer.current?.zoom(1.65);
            viewer.current?.render();
          }}
        >
          Reset View
        </button>
      </div>
    </div>
  );
}
