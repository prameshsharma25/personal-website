// Measurements only: never change scientific inputs, settings, or results.
export function createDiagnostics(clock = () => performance.now()) {
  const startedAt = clock();
  let phase = 'setup',
    stage = null,
    memory = null,
    peakMemory = null;
  const network = {
    supported: false,
    requests: 0,
    measuredRequests: 0,
    unmeasuredRequests: 0,
    cachedRequests: 0,
    transferBytes: 0,
    firstStart: null,
    lastEnd: null,
  };
  let pool = { size: 0, active: 0, peakActive: 0, stopped: true };
  return {
    pool(state) {
      pool = { ...state };
    },
    phase(next, total = 0) {
      if (stage && stage.endedAt === null) stage.endedAt = clock();
      phase = next;
      if (total > 0)
        stage = {
          phase: next,
          total,
          completed: 0,
          skipped: 0,
          failed: 0,
          startedAt: clock(),
          endedAt: null,
          lastMs: null,
          samples: [],
          completionTimes: [clock()],
        };
    },
    operation(milliseconds, { skipped = false, failed = false } = {}) {
      if (!stage) return;
      if (skipped) stage.skipped++;
      else {
        stage.completed++;
        if (failed) stage.failed++;
        stage.lastMs = Math.max(0, milliseconds);
        stage.samples.push(stage.lastMs);
        if (stage.samples.length > 20) stage.samples.shift();
        stage.completionTimes.push(clock());
        if (stage.completionTimes.length > 21) stage.completionTimes.shift();
      }
      if (stage.completed + stage.skipped >= stage.total)
        stage.endedAt = clock();
    },
    memory(bytes) {
      memory = Number.isFinite(bytes) && bytes > 0 ? bytes : null;
      if (memory !== null) peakMemory = Math.max(peakMemory || 0, memory);
    },
    networkSupported(value) {
      network.supported = value;
    },
    resource(entry, sameOrigin) {
      network.requests++;
      const bytes = Number(entry.transferSize);
      if (Number.isFinite(bytes) && bytes > 0) {
        network.measuredRequests++;
        network.transferBytes += bytes;
        network.firstStart = Math.min(
          network.firstStart ?? entry.startTime,
          entry.startTime
        );
        network.lastEnd = Math.max(
          network.lastEnd ?? entry.responseEnd,
          entry.responseEnd
        );
      } else if (sameOrigin && entry.decodedBodySize > 0) {
        network.measuredRequests++;
        network.cachedRequests++;
      } else {
        // Zero can mean either cache or restricted cross-origin timing. Never
        // report it as a measured zero-byte download without evidence.
        network.unmeasuredRequests++;
      }
    },
    snapshot() {
      const now = clock();
      const duration = stage
        ? Math.max(0, (stage.endedAt ?? now) - stage.startedAt)
        : 0;
      const mean = stage?.samples.length
        ? stage.samples.reduce((sum, value) => sum + value, 0) /
          stage.samples.length
        : null;
      const remaining = stage
        ? Math.max(0, stage.total - stage.completed - stage.skipped)
        : 0;
      const networkDuration =
        (network.lastEnd ?? 0) - (network.firstStart ?? 0);
      const completionCount = stage ? stage.completionTimes.length - 1 : 0;
      const completionSpan = completionCount
        ? stage.completionTimes.at(-1) - stage.completionTimes[0]
        : 0;
      return {
        elapsedMs: Math.max(0, now - startedAt),
        phase,
        stage: stage
          ? {
              phase: stage.phase,
              total: stage.total,
              completed: stage.completed,
              skipped: stage.skipped,
              failed: stage.failed,
              elapsedMs: duration,
              lastMs: stage.lastMs,
              meanMs: mean,
              ratePerMinute:
                duration > 0 && stage.completed > 0
                  ? (stage.completed * 60000) / duration
                  : null,
              remainingMs:
                remaining === 0
                  ? 0
                  : stage.samples.length >= 3
                    ? completionSpan > 0
                      ? (remaining * completionSpan) / completionCount
                      : null
                    : null,
            }
          : null,
        pythonMemoryBytes: memory,
        peakPythonMemoryBytes: peakMemory,
        alignmentPool: pool,
        network: {
          supported: network.supported,
          requests: network.requests,
          measuredRequests: network.measuredRequests,
          unmeasuredRequests: network.unmeasuredRequests,
          cachedRequests: network.cachedRequests,
          transferBytes: network.transferBytes,
          bytesPerSecond:
            networkDuration > 0 && network.transferBytes > 0
              ? (network.transferBytes * 1000) / networkDuration
              : null,
        },
      };
    },
  };
}

// A public Pyodide buffer view is backed by its entire WASM linear memory.
// Refresh and release the view each time because the memory can grow.
export function pythonMemoryBytes(probe) {
  let view;
  try {
    view = probe?.getBuffer('u8');
    return view?.data.buffer.byteLength || null;
  } catch {
    return null;
  } finally {
    try {
      view?.release();
    } catch {
      /* Optional diagnostic cleanup. */
    }
  }
}

export function monitorDiagnostics(send, base, runtime) {
  const metrics = createDiagnostics();
  let probe = null,
    lastSent = -Infinity,
    observer;
  const readEntries = (entries) => {
    for (const entry of entries) {
      if (!entry.name.startsWith(base.href) && !entry.name.startsWith(runtime))
        continue;
      metrics.resource(entry, new URL(entry.name).origin === base.origin);
    }
  };
  try {
    observer = new PerformanceObserver((list) =>
      readEntries(list.getEntries())
    );
    observer.observe({ type: 'resource', buffered: true });
    metrics.networkSupported(true);
  } catch {
    metrics.networkSupported(false);
  }
  const emit = (force = false) => {
    if (!force && performance.now() - lastSent < 1000) return;
    if (observer) readEntries(observer.takeRecords());
    metrics.memory(pythonMemoryBytes(probe));
    send({ type: 'diagnostics', diagnostics: metrics.snapshot() });
    lastSent = performance.now();
  };
  const interval = setInterval(() => emit(), 1000);
  return {
    ...metrics,
    emit,
    attachPython(python) {
      try {
        probe = python.runPython('bytearray(1)');
      } catch {
        /* Optional metric. */
      }
    },
    stop() {
      clearInterval(interval);
      observer?.disconnect();
      try {
        probe?.destroy();
      } catch {
        /* Optional diagnostic cleanup. */
      }
    },
  };
}
