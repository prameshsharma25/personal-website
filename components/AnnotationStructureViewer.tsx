import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  loadMolecularViewer,
  type MolecularViewer,
} from '../lib/molecular-viewer';
import type {
  Mapping,
  ProteinInput,
  ReferenceProtein,
  Residue,
} from '../lib/protein-annotations';
import { AMINO_NAMES, residuePreview } from '../lib/protein-hover';
import styles from '../styles/ProteinAnnotations.module.css';
type Atom = { chain: string; resi: number };
type SelectableViewer = MolecularViewer & {
  addStyle: (selection: object, style: object) => void;
  setHover: (atom: Atom | null) => void;
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
  reference,
  mapping,
  onPick,
  onHover,
  focus,
}: {
  input: ProteinInput;
  chain: string;
  selected: Set<string>;
  annotated: Set<string>;
  reference: ReferenceProtein | null;
  mapping: Mapping | null;
  onPick: (key: string, add: boolean) => void;
  onHover: (residue: Residue | null) => void;
  focus: number;
}) {
  const host = useRef<HTMLDivElement>(null),
    viewer = useRef<SelectableViewer>(null);
  const viewport = useRef<HTMLDivElement>(null),
    tooltip = useRef<HTMLDivElement>(null),
    pointer = useRef({ x: 0, y: 0 }),
    allowHover = useRef(false);
  const tooltipId = useId();
  const [hovered, setHovered] = useState<Residue | null>(null);
  const callbacks = useRef({ onPick, onHover });
  callbacks.current = { onPick, onHover };
  const [state, setState] = useState('loading'),
    [style, setStyle] = useState('Cartoon');
  const preview = useMemo(
    () => (hovered ? residuePreview(hovered, chain, reference, mapping) : null),
    [hovered, chain, reference, mapping]
  );
  const clearHover = useCallback(() => {
    setHovered(null);
    callbacks.current.onHover(null);
  }, []);
  const dismissHover = useCallback(() => {
    // Reset the renderer's hover identity too, so reentering the same atom
    // triggers its enter callback. Its leave callback only clears React state.
    viewer.current?.setHover(null);
    clearHover();
  }, [clearHover]);
  const placeTooltip = useCallback(() => {
    const box = viewport.current,
      tip = tooltip.current;
    if (!box || !tip) return;
    const { x, y } = pointer.current;
    const padding = 10,
      gap = 16;
    const leftSpace = Math.max(0, x - gap - padding);
    const rightSpace = Math.max(0, box.clientWidth - x - gap - padding);
    // Keep the tooltip beside the pointer, so it cannot conceal the highlighted
    // residue when a full-width card would otherwise overlap the molecule.
    tip.style.width = `${Math.min(290, Math.max(leftSpace, rightSpace))}px`;
    const width = tip.offsetWidth,
      height = tip.offsetHeight;
    const left = rightSpace >= width ? x + gap : x - width - gap;
    const top =
      y + height + 16 > box.clientHeight - padding ? y - height - 16 : y + 16;
    tip.style.left = `${Math.max(padding, Math.min(left, box.clientWidth - width - padding))}px`;
    tip.style.top = `${Math.max(padding, Math.min(top, box.clientHeight - height - padding))}px`;
  }, []);
  useLayoutEffect(placeTooltip, [hovered, preview, placeTooltip]);
  useEffect(dismissHover, [input, chain, style, focus, dismissHover]);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        allowHover.current = false;
        dismissHover();
      }
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [dismissHover]);
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
      clearHover();
    };
    element.addEventListener('webglcontextlost', lost, true);
    void loadMolecularViewer()
      .then((library) => {
        if (disposed) return;
        scene = library.createViewer(element, {
          backgroundColor: '#06101e',
          antialias: true,
          hoverDuration: 0,
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
          (atom) => {
            if (disposed || !allowHover.current) return;
            const residue = lookup.get(`${atom.chain}:${atom.resi}`) || null;
            setHovered(residue);
            callbacks.current.onHover(residue);
          },
          clearHover
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
        resize = new ResizeObserver(() => {
          scene.resize();
          placeTooltip();
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
      scene?.destroy();
      viewer.current = null;
      element.removeEventListener('webglcontextlost', lost, true);
      element.replaceChildren();
    };
  }, [input, clearHover, placeTooltip]);
  useLayoutEffect(() => {
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
    // Hover overrides annotation/selection colors temporarily. Reapplying the
    // base styles above restores them when the pointer leaves the residue.
    if (hovered && input.chains.some((c) => c.residues.includes(hovered))) {
      scene.addStyle(
        { chain: hovered.viewerChain, resi: hovered.viewerPosition },
        {
          cartoon: { color: '#f38bff', opacity: 1 },
          stick: { color: '#f38bff', radius: 0.23, opacity: 1 },
        }
      );
    }
    scene.render();
  }, [input, chain, selected, annotated, style, state, hovered]);
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
        ref={viewport}
        className={styles.viewport}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          pointer.current = {
            x: event.clientX - box.left,
            y: event.clientY - box.top,
          };
          allowHover.current = event.buttons === 0;
          placeTooltip();
        }}
        onPointerDown={() => {
          allowHover.current = false;
          dismissHover();
        }}
        onPointerLeave={() => {
          allowHover.current = false;
          dismissHover();
        }}
        onWheel={() => {
          allowHover.current = false;
          dismissHover();
        }}
      >
        <div
          ref={host}
          className={styles.canvas}
          role="img"
          aria-label={`Interactive protein structure: ${input.name}`}
          aria-describedby={
            state === 'ready' && hovered ? tooltipId : undefined
          }
        />
        {state === 'ready' && hovered && preview && (
          <div
            ref={tooltip}
            id={tooltipId}
            role="tooltip"
            className={styles.residueTooltip}
          >
            <strong className={styles.tooltipTitle}>
              {hovered.name} {hovered.number} <span>· {hovered.letter}</span>
            </strong>
            <p>
              {AMINO_NAMES[hovered.letter] || 'Amino Acid'} · Chain{' '}
              {hovered.chain || 'Unnamed'}
            </p>
            {preview.position != null && reference && (
              <p className={styles.tooltipReference}>
                UniProt {reference.accession} · Position {preview.position}
              </p>
            )}
            {preview.referenceLetter &&
              preview.referenceLetter !== hovered.letter && (
                <p className={styles.tooltipCaution}>
                  Reference residue: {preview.referenceLetter}. This position
                  differs in your structure.
                </p>
              )}
            {preview.message && <p>{preview.message}</p>}
            {preview.annotations.length > 0 && (
              <ul>
                {preview.annotations.slice(0, 2).map((annotation) => (
                  <li key={annotation.id}>
                    <strong>
                      {annotation.category.replace(/\b\w/g, (c) =>
                        c.toUpperCase()
                      )}{' '}
                      <span>· {annotation.source}</span>
                    </strong>
                    <p>
                      {annotation.description || 'Annotated reference region.'}
                      {annotation.uncertainty
                        ? ' Boundaries are approximate.'
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.tooltipHint}>
              {preview.annotations.length > 2
                ? `${preview.annotations.length - 2} More Annotations · `
                : ''}
              Click The Residue For Details
            </p>
          </div>
        )}
      </div>
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
