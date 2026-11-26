import { alignmentRunner } from './run-mmalign.mjs';
let align,
  busy = false;
self.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  try {
    if (data.type === 'init' && !align) {
      align = await alignmentRunner(data.script, data.binary);
      postMessage({ type: 'ready' });
    } else if (data.type === 'align' && align) {
      const started = performance.now();
      let stdout = '',
        error = '';
      try {
        stdout = await align(new Uint8Array(data.a), new Uint8Array(data.b));
      } catch (problem) {
        error = problem instanceof Error ? problem.message : String(problem);
      }
      postMessage({
        type: 'result',
        stdout,
        error,
        elapsedMs: performance.now() - started,
      });
    } else throw new Error('Invalid alignment worker request.');
  } catch (error) {
    postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    busy = false;
  }
};
