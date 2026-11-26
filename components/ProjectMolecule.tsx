import { useEffect, useRef, useState } from 'react';
import structures from '../data/project-structures.json';
import {
  loadMolecularViewer,
  type MolecularViewer,
} from '../lib/molecular-viewer';
import styles from '../styles/ResearchProjects.module.css';

export type ProjectStructure = keyof typeof structures;

/** A shaded, locally rendered poster is available before JS, WebGL, or PDB loading. */
export default function ProjectMolecule({
  model,
  enabled,
  running,
}: {
  model: ProjectStructure;
  enabled: boolean;
  running: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<MolecularViewer | null>(null);
  const [state, setState] = useState<'poster' | 'loading' | 'ready'>('poster');
  const [motionAllowed, setMotionAllowed] = useState(false);
  const structure = structures[model];

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotionAllowed(!preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setState('poster');
    if (!enabled || !host.current) return;
    const element = host.current;
    const controller = new AbortController();
    let cancelled = false;
    let scene: MolecularViewer | null = null;
    let resize: ResizeObserver | undefined;
    const lost = (event: Event) => {
      event.preventDefault();
      scene?.spin(false);
      setState('poster');
    };
    element.addEventListener('webglcontextlost', lost, true);

    async function load() {
      setState('loading');
      try {
        const [library, response] = await Promise.all([
          loadMolecularViewer(),
          fetch(structure.file, { signal: controller.signal }),
        ]);
        if (!response.ok) throw new Error('Structure unavailable');
        const pdb = await response.text();
        if (!pdb.includes('ATOM')) throw new Error('Invalid structure');
        if (cancelled) return;
        scene = library.createViewer(element, {
          backgroundColor: '#071323',
          backgroundAlpha: 0,
          antialias: true,
          cartoonQuality: 8,
          disableFog: true,
          nomouse: true,
        });
        viewer.current = scene;
        scene.setProjection('orthographic');
        scene.addModel(pdb, 'pdb', { keepH: false });
        const chains = [
          ...new Set(
            pdb
              .split('\n')
              .filter((line) => line.startsWith('ATOM'))
              .map((line) => line[21])
          ),
        ];
        chains.forEach((chain, i) =>
          scene?.setStyle(
            { chain },
            {
              cartoon: {
                color: structure.colors[i % structure.colors.length],
                thickness: 0.5,
                arrows: true,
              },
            }
          )
        );
        scene.zoomTo();
        scene.rotate(structure.rotateY, 'y');
        scene.rotate(structure.rotateX, 'x');
        scene.zoom(structure.zoom);
        scene.render();
        resize = new ResizeObserver(() => scene?.resize());
        resize.observe(element);
        setState('ready');
      } catch {
        if (!cancelled) {
          scene?.destroy();
          viewer.current = null;
          scene = null;
          element.replaceChildren();
          setState('poster');
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
      resize?.disconnect();
      element.removeEventListener('webglcontextlost', lost, true);
      scene?.spin(false);
      scene?.destroy();
      viewer.current = null;
      element.replaceChildren();
    };
  }, [enabled, structure]);

  const spinning = enabled && running && motionAllowed && state === 'ready';
  useEffect(() => {
    viewer.current?.spin(spinning ? 'vy' : false, 0.35);
  }, [spinning, state]);

  return (
    <div
      className={styles.molecule}
      data-molecule={model}
      data-viewer={state}
      data-spinning={spinning}
      aria-hidden="true"
    >
      {/* The parent SVG provides the accessible name and molecular provenance. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={structure.poster}
        alt=""
        width="600"
        height="600"
        className={styles.moleculePoster}
      />
      <div ref={host} className={styles.moleculeCanvas} />
    </div>
  );
}
