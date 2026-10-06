export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Drives automatic playback. Each tick re-reads the interval, so speed changes apply immediately
 * on the next candle. `onTick` returns false to stop playback (e.g. end of data).
 */
export class ReplayPlayer {
  readonly #onTick: () => boolean;
  readonly #getIntervalMs: () => number;
  readonly #timers: Timers;
  #handle: unknown = null;

  constructor(onTick: () => boolean, getIntervalMs: () => number, timers: Timers = defaultTimers) {
    this.#onTick = onTick;
    this.#getIntervalMs = getIntervalMs;
    this.#timers = timers;
  }

  get isRunning(): boolean {
    return this.#handle !== null;
  }

  start(): void {
    if (this.isRunning) return;
    this.#schedule();
  }

  stop(): void {
    if (this.#handle !== null) this.#timers.clearTimeout(this.#handle);
    this.#handle = null;
  }

  /** Restarts the pending tick with the current interval (used after a speed change). */
  reschedule(): void {
    if (!this.isRunning) return;
    this.stop();
    this.#schedule();
  }

  #schedule(): void {
    this.#handle = this.#timers.setTimeout(() => {
      this.#handle = null;
      if (this.#onTick()) this.#schedule();
    }, this.#getIntervalMs());
  }
}
