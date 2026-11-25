// Loaded only in the browser when the homepage structure enters the viewport.
export type MolecularViewer = {
  addModel: (data: string, format: string, options?: object) => unknown;
  removeAllModels: () => void;
  setStyle: (selection: object, style: object) => void;
  setProjection: (projection: string) => void;
  zoomTo: (selection?: object) => void;
  zoom: (factor: number) => void;
  rotate: (angle: number, axis: string) => void;
  getView: () => number[];
  setView: (view: number[]) => void;
  render: () => void;
  resize: () => void;
  spin: (axis: string | boolean, speed?: number) => void;
  destroy: () => void;
};
type MolecularLibrary = { createViewer: (element: HTMLElement, config: object) => MolecularViewer };
declare global { interface Window { $3Dmol?: MolecularLibrary } }
let pending: Promise<MolecularLibrary> | undefined;
export function loadMolecularViewer() {
  if (window.$3Dmol) return Promise.resolve(window.$3Dmol);
  if (pending) return pending;
  pending = new Promise<MolecularLibrary>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/3dmol/3Dmol-3.0.0.min.js'; script.async = true;
    script.onload = () => { if (window.$3Dmol) resolve(window.$3Dmol); else { pending = undefined; script.remove(); reject(new Error('Viewer unavailable')); } };
    script.onerror = () => { pending = undefined; script.remove(); reject(new Error('Viewer unavailable')); };
    document.head.appendChild(script);
  });
  return pending;
}
