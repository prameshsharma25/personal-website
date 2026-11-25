// Only active intervals count. A monotonic clock avoids system clock changes.
export class AnalysisClock {
  private accumulated = 0;
  private started: number | null = null;

  constructor(private now = () => performance.now()) {}

  get running() {
    return this.started !== null;
  }

  get elapsedMs() {
    return (
      this.accumulated +
      (this.started === null ? 0 : Math.max(0, this.now() - this.started))
    );
  }

  restore(elapsedMs = 0) {
    this.accumulated = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    this.started = null;
  }

  start() {
    if (!this.running) this.started = this.now();
  }

  stop() {
    this.accumulated = this.elapsedMs;
    this.started = null;
    return this.accumulated;
  }
}
