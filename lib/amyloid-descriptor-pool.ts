import type { AnalysisModel } from './amyloid-jobs';
import type { AlignmentWorkers } from './amyloid-alignment-pool';
export { resolveDescriptorWorkers } from '../public/tools/amyloid-device/v1/descriptor-scheduler.mjs';
export type DescriptorWorkers = AlignmentWorkers;
export type DescriptorEntry = {
  id: string;
  filename: string;
  stored_name: string;
};
export type DescriptorInit = {
  engine: Record<string, unknown>;
  packageBytes: ArrayBuffer;
  analysisBytes: ArrayBuffer;
};
export type DescriptorOutput = {
  model: AnalysisModel;
  artifacts: { path: string; bytes: ArrayBuffer }[];
  elapsedMs: number;
};
export type DescriptorState = {
  size: number;
  active: number;
  peakActive: number;
  stopped: boolean;
  memoryBytes: number;
  peakMemoryBytes: number;
};
type Options = {
  createWorker?: () => Worker;
  startupTimeoutMs?: number;
  taskTimeoutMs?: number;
  onState?: (state: DescriptorState) => void;
  onProgress?: (index: number, stage: string, completed: number) => void;
};
type DescriptorReply =
  | { type: 'ready'; memoryBytes?: number }
  | (DescriptorOutput & { type: 'result'; memoryBytes?: number });
type Slot = {
  worker: Worker;
  busy: boolean;
  index: number;
  memoryBytes: number;
  failure: Error | null;
  pending: null | {
    resolve: (data: DescriptorReply) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
};

// Owned by the page so cancellation/unmount always terminates every child.
export class DescriptorPool {
  private slots: Slot[] = [];
  private stopped = false;
  private peakActive = 0;
  private peakMemoryBytes = 0;
  constructor(
    private config: DescriptorInit,
    private options: Options = {}
  ) {}
  private emit() {
    const active = this.slots.filter((slot) => slot.busy).length;
    const memoryBytes = this.slots.reduce(
      (sum, slot) => sum + slot.memoryBytes,
      0
    );
    this.peakActive = Math.max(this.peakActive, active);
    this.peakMemoryBytes = Math.max(this.peakMemoryBytes, memoryBytes);
    this.options.onState?.({
      size: this.slots.length,
      active,
      peakActive: this.peakActive,
      stopped: this.stopped,
      memoryBytes,
      peakMemoryBytes: this.peakMemoryBytes,
    });
  }
  private reject(slot: Slot, error: Error) {
    slot.failure = error;
    if (slot.pending) {
      clearTimeout(slot.pending.timer);
      slot.pending.reject(error);
      slot.pending = null;
    }
  }
  private call(
    slot: Slot,
    message: unknown,
    timeout: number,
    transfers: Transferable[] = []
  ) {
    return new Promise<DescriptorReply>((resolve, reject) => {
      slot.pending = {
        resolve,
        reject,
        timer: setTimeout(
          () =>
            this.reject(
              slot,
              new Error(
                'A descriptor worker exceeded its time limit. Try fewer workers or smaller structures.'
              )
            ),
          timeout
        ),
      };
      try {
        slot.worker.postMessage(message, transfers);
      } catch (error) {
        this.reject(
          slot,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
  }
  private closeSlots() {
    for (const slot of this.slots) {
      this.reject(slot, new Error('Descriptor analysis cancelled.'));
      slot.worker.onmessage = null;
      slot.worker.onerror = null;
      slot.worker.onmessageerror = null;
      slot.worker.terminate();
      slot.memoryBytes = 0;
      slot.busy = false;
    }
    this.emit();
  }
  private async start(count: number) {
    if (this.stopped) throw new Error('Descriptor analysis cancelled.');
    this.slots = [];
    const readiness: Promise<unknown>[] = [];
    for (let index = 0; index < count; index++) {
      const worker = (
        this.options.createWorker ??
        (() =>
          new Worker('/tools/amyloid-device/v1/descriptor-worker.mjs', {
            type: 'module',
            name: 'amyloid-descriptors',
          }))
      )();
      const slot: Slot = {
        worker,
        busy: false,
        index: -1,
        memoryBytes: 0,
        failure: null,
        pending: null,
      };
      this.slots.push(slot);
      worker.onerror = (event) => {
        event.preventDefault();
        this.reject(
          slot,
          new Error(
            'A descriptor worker stopped unexpectedly. Try fewer workers.'
          )
        );
      };
      worker.onmessageerror = () =>
        this.reject(slot, new Error('A descriptor result could not be read.'));
      worker.onmessage = ({ data }) => {
        if (this.stopped || !slot.pending) return;
        if (Number.isFinite(data.memoryBytes) && data.memoryBytes > 0)
          slot.memoryBytes = data.memoryBytes;
        this.emit();
        if (data.type === 'progress') {
          this.options.onProgress?.(slot.index, data.stage, data.completed);
          return;
        }
        if (data.type === 'error') {
          this.reject(slot, new Error(data.message));
          return;
        }
        if (data.type !== 'ready' && data.type !== 'result') return;
        const pending = slot.pending;
        slot.pending = null;
        clearTimeout(pending.timer);
        pending.resolve(data);
      };
      const ready = this.call(
        slot,
        { type: 'init', ...this.config },
        this.options.startupTimeoutMs ?? 60000
      );
      // Observe rejection even if constructing a later worker throws.
      void ready.catch(() => {});
      readiness.push(ready);
    }
    this.emit();
    await Promise.all(readiness);
  }
  async initialize(count: number) {
    if (!Number.isInteger(count) || count < 1 || count > 4)
      throw new Error('Invalid descriptor worker count.');
    try {
      await this.start(count);
      return { workers: count, fallback: null as string | null };
    } catch (error) {
      this.closeSlots();
      if (this.stopped || count === 1) throw error;
      try {
        await this.start(1);
      } catch (fallbackError) {
        this.closeSlots();
        throw fallbackError;
      }
      return {
        workers: 1,
        fallback:
          'Multiple descriptor workers could not start. This run used one descriptor worker.',
      };
    }
  }
  async run(
    entry: DescriptorEntry,
    bytes: ArrayBuffer,
    index: number
  ): Promise<DescriptorOutput> {
    if (this.stopped) throw new Error('Descriptor analysis cancelled.');
    const slot = this.slots.find((item) => !item.busy);
    if (!slot) throw new Error('No descriptor worker is available.');
    if (slot.failure) {
      const failure = slot.failure;
      this.dispose();
      throw failure;
    }
    slot.busy = true;
    slot.index = index;
    this.emit();
    try {
      const output = await this.call(
        slot,
        { type: 'analyze', entry, bytes },
        this.options.taskTimeoutMs ?? 300000,
        [bytes]
      );
      if (output.type !== 'result')
        throw new Error('Unexpected descriptor worker response.');
      return output;
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      slot.busy = false;
      this.emit();
    }
  }
  dispose() {
    this.stopped = true;
    this.closeSlots();
  }
}
