import { DATA_WINDOWS, MAX_EMPTY_FORWARD_FETCHES, PREFETCH_THRESHOLD_CANDLES } from '../replay/dataWindow';
import { ReplayEngine, type ReplaySpeed, type ReplayState } from '../replay/replayEngine';
import { ReplayPlayer } from '../replay/replayPlayer';
import type { Candle, Granularity } from '../types/market';
import type { SessionSetup } from '../types/session';

/** Fetches completed candles with open time in [fromMs, toMs). */
export type CandleFetcher = (instrument: string, granularity: Granularity, fromMs: number, toMs: number) => Promise<Candle[]>;

export type PlaybackStatus = 'playing' | 'paused';

export interface ReplaySnapshot {
  replay: ReplayState & { status: PlaybackStatus };
  /** Candles revealed so far — the only market data the UI ever receives. */
  visibleCandles: readonly Candle[];
  currentCandle: Candle;
  loadingMore: boolean;
  /** No more historical data exists after the loaded range. */
  dataExhausted: boolean;
  /** Last background error (e.g. prefetch failed) */
  error: string | null;
  /** Increments on every reset, so views can re-center. */
  runId: number;
}

/**
 * Coordinates the replay engine, the playback timer and forward-data prefetching,
 * and publishes immutable snapshots for the UI. Contains no React code.
 */
export class ReplaySession {
  readonly setup: SessionSetup;
  readonly #engine: ReplayEngine;
  readonly #player: ReplayPlayer;
  readonly #fetchCandles: CandleFetcher;
  readonly #listeners = new Set<() => void>();
  readonly #now: () => number;
  #loadedUntilMs: number;
  #emptyForwardFetches = 0;
  #loadingMore = false;
  #dataExhausted = false;
  #error: string | null = null;
  #disposed = false;
  #playing = false;
  #runId = 0;
  #snapshot: ReplaySnapshot;

  constructor(
    setup: SessionSetup,
    candles: readonly Candle[],
    startIndex: number,
    loadedUntilMs: number,
    fetchCandles: CandleFetcher,
    now: () => number = Date.now,
  ) {
    this.setup = setup;
    this.#engine = new ReplayEngine(candles, startIndex);
    this.#player = new ReplayPlayer(() => this.#tick(), () => this.#engine.getIntervalMs());
    this.#fetchCandles = fetchCandles;
    this.#loadedUntilMs = loadedUntilMs;
    this.#now = now;
    this.#snapshot = this.#buildSnapshot();
    this.#maybePrefetch();
  }

  // ---- external store protocol (useSyncExternalStore) ----

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): ReplaySnapshot => this.#snapshot;

  // ---- replay controls ----

  next(): void {
    this.pause();
    if (this.#step()) this.#emit();
  }

  previous(): void {
    this.pause();
    if (this.#engine.previous()) this.#emit();
  }

  play(): void {
    if (this.#playing) return;
    if (!this.#engine.hasNext() && !this.#loadingMore) return;
    this.#playing = true;
    this.#player.start();
    this.#emit();
  }

  pause(): void {
    if (!this.#playing) return;
    this.#playing = false;
    this.#player.stop();
    this.#emit();
  }

  togglePlay(): void {
    if (this.#playing) this.pause();
    else this.play();
  }

  setSpeed(speed: ReplaySpeed): void {
    this.#engine.setSpeed(speed);
    this.#player.reschedule();
    this.#emit();
  }

  reset(): void {
    this.#playing = false;
    this.#player.stop();
    this.#engine.reset();
    this.#runId += 1;
    this.#emit();
  }

  dispose(): void {
    this.#disposed = true;
    this.#player.stop();
    this.#listeners.clear();
  }

  // ---- internals ----

  /** Hook for subclasses/collaborators: called exactly once per newly revealed candle. */
  protected onNewCandle(_candle: Candle): void {}

  #step(): boolean {
    const result = this.#engine.next();
    if (result?.isNew) this.onNewCandle(result.candle);
    this.#maybePrefetch();
    return result !== null;
  }

  /** One playback tick. While more data is being fetched at the end of the buffer, playback waits. */
  #tick(): boolean {
    if (this.#engine.hasNext()) {
      this.#step();
    } else if (!this.#loadingMore) {
      this.#playing = false;
    }
    this.#emit();
    return this.#playing;
  }

  #maybePrefetch(): void {
    if (this.#loadingMore || this.#dataExhausted || this.#disposed) return;
    if (this.#engine.bufferedAhead() >= PREFETCH_THRESHOLD_CANDLES) return;

    const fromMs = this.#loadedUntilMs;
    const toMs = Math.min(fromMs + DATA_WINDOWS[this.setup.granularity].aheadMs, this.#now());
    if (toMs <= fromMs) {
      this.#dataExhausted = true;
      return;
    }

    this.#loadingMore = true;
    this.#fetchCandles(this.setup.instrument, this.setup.granularity, fromMs, toMs)
      .then((candles) => {
        if (this.#disposed) return;
        this.#loadedUntilMs = toMs;
        this.#error = null;
        if (this.#engine.appendCandles(candles) === 0) {
          this.#emptyForwardFetches += 1;
          if (this.#emptyForwardFetches >= MAX_EMPTY_FORWARD_FETCHES) this.#dataExhausted = true;
        } else {
          this.#emptyForwardFetches = 0;
        }
      })
      .catch((error: unknown) => {
        if (this.#disposed) return;
        this.#error = `Could not load more candles: ${error instanceof Error ? error.message : String(error)}`;
        // Stop retrying in a loop; the user can press Next/Play to try again.
      })
      .finally(() => {
        if (this.#disposed) return;
        this.#loadingMore = false;
        if (this.#error === null) this.#maybePrefetch();
        this.#emit();
      });
    this.#emit();
  }

  #emit(): void {
    if (this.#disposed) return;
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) listener();
  }

  #buildSnapshot(): ReplaySnapshot {
    const replay = this.#engine.getState();
    return {
      replay: { ...replay, status: this.#playing ? 'playing' : 'paused' },
      visibleCandles: this.#engine.getVisibleCandles(),
      currentCandle: this.#engine.getCurrentCandle(),
      loadingMore: this.#loadingMore,
      dataExhausted: this.#dataExhausted && !this.#engine.hasNext(),
      error: this.#error,
      runId: this.#runId,
    };
  }
}
