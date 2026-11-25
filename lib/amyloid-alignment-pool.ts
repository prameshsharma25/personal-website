export type AlignmentWorkers = 'auto' | 1 | 2 | 4;
export type PoolState = {
  size: number;
  active: number;
  peakActive: number;
  stopped: boolean;
};
export type AlignmentResult = {
  stdout: string;
  error: string;
  elapsedMs: number;
};

export function resolveAlignmentWorkers(
  choice: AlignmentWorkers,
  cores: number,
  tasks: number
) {
  if (!['auto', 1, 2, 4].includes(choice))
    throw new Error('Choose Auto, 1, 2, or 4 alignment workers.');
  const available =
    Number.isFinite(cores) && cores >= 1 ? Math.floor(cores) : 2;
  const requested =
    choice === 'auto'
      ? Math.min(2, Math.max(1, available - 1))
      : Math.min(choice, available);
  return Math.max(1, Math.min(requested, tasks));
}

type Options = {
  onState?: (state: PoolState) => void;
  createWorker?: () => Worker;
  startupTimeoutMs?: number;
  pairTimeoutMs?: number;
};

class AlignmentSlot {
  worker: Worker | null = null;
  busy = false;
  disposed = false;
  private failure: Error | null = null;
  ready: Promise<unknown>;
  private pending: {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  constructor(
    script: ArrayBuffer,
    binary: ArrayBuffer,
    private options: Options
  ) {
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.reject(
            new Error('An alignment worker could not start in time.')
          ),
        options.startupTimeoutMs ?? 30000
      );
      this.pending = { resolve, reject, timer };
      try {
        this.worker = (
          options.createWorker ??
          (() =>
            new Worker('/tools/amyloid-device/v1/alignment-worker.mjs', {
              type: 'module',
              name: 'amyloid-mmalign',
            }))
        )();
        this.worker.onerror = (event) => {
          event.preventDefault();
          this.reject(new Error('An alignment worker stopped unexpectedly.'));
        };
        this.worker.onmessageerror = () =>
          this.reject(
            new Error('An alignment worker returned an unreadable result.')
          );
        this.worker.onmessage = ({ data }) => {
          if (!this.pending || this.disposed) return;
          if (data.type === 'error') {
            this.reject(new Error(data.message));
            return;
          }
          if (data.type !== 'ready' && data.type !== 'result') return;
          const pending = this.pending;
          this.pending = null;
          clearTimeout(pending.timer);
          pending.resolve(data);
        };
        // Clone the small engine assets; retain them for replacement workers.
        this.worker.postMessage({ type: 'init', script, binary });
      } catch (error) {
        this.reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    // Replacement startup may fail before the next task asks for this slot.
    void this.ready.catch(() => {});
  }
  private reject(error: Error) {
    this.failure = error;
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }
  call(a: ArrayBuffer, b: ArrayBuffer): Promise<AlignmentResult> {
    return new Promise((resolve, reject) => {
      if (this.disposed || !this.worker) {
        reject(new Error('Alignment cancelled.'));
        return;
      }
      if (this.failure) {
        reject(this.failure);
        return;
      }
      const timer = setTimeout(
        () =>
          this.reject(
            new Error('This MM-align comparison exceeded its time limit.')
          ),
        this.options.pairTimeoutMs ?? 120000
      );
      this.pending = {
        resolve: (value) => resolve(value as AlignmentResult),
        reject,
        timer,
      };
      try {
        this.worker.postMessage({ type: 'align', a, b }, [a, b]);
      } catch (error) {
        this.reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  dispose() {
    this.disposed = true;
    this.reject(new Error('Alignment cancelled.'));
    this.worker?.terminate();
    this.worker = null;
  }
}

// The page owns every worker: cancellation and unmount terminate all of them,
// without relying on a browser to clean up nested worker threads.
export class AlignmentPool {
  private slots: AlignmentSlot[] = [];
  private disposed = false;
  private peakActive = 0;
  constructor(
    private script: ArrayBuffer,
    private binary: ArrayBuffer,
    private options: Options = {}
  ) {}
  private emit() {
    const active = this.slots.filter(
      (slot) => slot.busy && !slot.disposed
    ).length;
    this.peakActive = Math.max(this.peakActive, active);
    this.options.onState?.({
      size: this.slots.length,
      active,
      peakActive: this.peakActive,
      stopped: this.disposed,
    });
  }
  async initialize(size: number) {
    if (!Number.isInteger(size) || size < 1 || size > 4)
      throw new Error('Invalid alignment worker count.');
    const start = async (count: number) => {
      if (this.disposed) throw new Error('Alignment cancelled.');
      this.slots = Array.from(
        { length: count },
        () => new AlignmentSlot(this.script, this.binary, this.options)
      );
      this.emit();
      await Promise.all(this.slots.map((slot) => slot.ready));
    };
    try {
      await start(size);
      return { workers: size, fallback: null as string | null };
    } catch (error) {
      this.slots.forEach((slot) => slot.dispose());
      if (this.disposed || size === 1) throw error;
      await start(1);
      return {
        workers: 1,
        fallback:
          'Multiple alignment workers could not start. This run used one alignment worker.',
      };
    }
  }
  async run(a: ArrayBuffer, b: ArrayBuffer): Promise<AlignmentResult> {
    if (this.disposed) throw new Error('Alignment cancelled.');
    const index = this.slots.findIndex((slot) => !slot.busy);
    if (index < 0) throw new Error('No alignment worker is available.');
    const slot = this.slots[index];
    const started = performance.now();
    let replace = false;
    slot.busy = true;
    this.emit();
    try {
      await slot.ready;
      return await slot.call(a, b);
    } catch (error) {
      replace = true;
      return {
        stdout: '',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: performance.now() - started,
      };
    } finally {
      slot.busy = false;
      if (replace) {
        slot.dispose();
        if (!this.disposed)
          this.slots[index] = new AlignmentSlot(
            this.script,
            this.binary,
            this.options
          );
      }
      this.emit();
    }
  }
  dispose() {
    this.disposed = true;
    this.slots.forEach((slot) => slot.dispose());
    this.emit();
  }
}
