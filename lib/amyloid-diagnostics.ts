import type { DescriptorState } from './amyloid-descriptor-pool';
export type DeviceDiagnostics = {
  descriptorPool?: DescriptorState;
  alignmentPool: {
    size: number;
    active: number;
    peakActive: number;
    stopped: boolean;
  };
  elapsedMs: number;
  phase: string;
  stage: {
    phase: string;
    total: number;
    completed: number;
    skipped: number;
    failed: number;
    elapsedMs: number;
    lastMs: number | null;
    meanMs: number | null;
    ratePerMinute: number | null;
    remainingMs: number | null;
  } | null;
  pythonMemoryBytes: number | null;
  peakPythonMemoryBytes: number | null;
  network: {
    supported: boolean;
    requests: number;
    measuredRequests: number;
    unmeasuredRequests: number;
    cachedRequests: number;
    transferBytes: number;
    bytesPerSecond: number | null;
  };
};

export function formatBytes(bytes: number | null) {
  if (bytes === null || !Number.isFinite(bytes)) return 'Unavailable';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

export function formatDuration(ms: number | null) {
  if (ms === null || !Number.isFinite(ms)) return 'Measuring…';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 3600000)
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}
