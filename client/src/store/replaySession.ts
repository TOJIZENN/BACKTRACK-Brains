import {
  DATA_WINDOWS,
  MAX_EMPTY_FORWARD_FETCHES,
  PREFETCH_RETRY_BACKOFF_MS,
  PREFETCH_THRESHOLD_CANDLES,
} from '../replay/dataWindow';
import { ReplayEngine, type ReplaySpeed, type ReplayState } from '../replay/replayEngine';
import { ReplayPlayer } from '../replay/replayPlayer';
import { computeStats, type AccountStats } from '../trading/statistics';
import { OrderRejectedError, TradingAccount, type MarketQuote, type OrderPreview } from '../trading/tradingAccount';
import type { OrderRequest, Trade } from '../trading/types';
import { GRANULARITY_SECONDS, INSTRUMENTS, type Candle, type Granularity } from '../types/market';
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
  /** A next candle exists, or may still be loaded (more data exists / a fetch is pending or retryable). */
  canAdvance: boolean;
  /** Last background error (e.g. prefetch failed) */
  error: string | null;
  /** Increments on every reset, so views can re-center. */
  runId: number;
  trades: readonly Trade[];
  stats: AccountStats;
  /** Most recent trade events, newest last (for notifications) */
  events: readonly TradeEvent[];
}

export interface TradeEvent {
  id: number;
  kind: 'opened' | 'closed';
  trade: Trade;
}

export type OrderResult = { ok: true; trade: Trade } | { ok: false; error: string };

const MAX_EVENTS = 10;

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
  /** Automatic prefetch retries are suppressed until this time after a failure. */
  #retryAfterMs = 0;
  /** Settles when the in-flight forward fetch finishes (null when idle). */
  #prefetchPromise: Promise<void> | null = null;
  #disposed = false;
  #playing = false;
  #runId = 0;
  #account: TradingAccount;
  #events: TradeEvent[] = [];
  #nextEventId = 1;
  #snapshot: ReplaySnapshot;

  constructor(
    setup: SessionSetup,
    candles: readonly Candle[],
    startIndex: number,
    loadedUntilMs: number,
    fetchCandles: CandleFetcher,
    now: () => number = Date.now,
    account?: TradingAccount,
  ) {
    this.setup = setup;
    this.#account = account ?? this.#newAccount();
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
    if (this.#step()) {
      this.#emit();
    } else {
      // At the end of the loaded data: an explicit Next retries loading more right away.
      this.#maybePrefetch(true);
    }
  }

  previous(): void {
    this.pause();
    if (this.#engine.previous()) this.#emit();
  }

  play(): void {
    if (this.#playing) return;
    if (!this.#engine.hasNext()) {
      this.#maybePrefetch(true);
      if (!this.#loadingMore) return;
    }
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

  /** Replay clock: close time (ms) of the latest revealed candle — everything before it has "happened". */
  clockMs(): number {
    return (this.#engine.getLiveEdgeCandle().time + GRANULARITY_SECONDS[this.setup.granularity]) * 1000;
  }

  /**
   * Prepares a switch to a timeframe of `barSeconds`: returns to the live edge, then keeps revealing
   * candles (resolving trades on each, exactly like Next) until the clock reaches the next bar boundary
   * of the new timeframe. That way the new timeframe never shows a bar that is partly in the future,
   * and open trades are never resolved against prices from before their fill. Stops early at gaps
   * (weekends) and at the true end of the data.
   */
  async alignClockTo(barSeconds: number): Promise<{ clockMs: number; advancedBars: number }> {
    this.pause();
    while (!this.#engine.getState().atLiveEdge && this.#engine.next()) {
      // Re-showing already revealed candles: nothing to resolve.
    }
    const targetSec = Math.ceil(this.clockMs() / 1000 / barSeconds) * barSeconds;
    let advancedBars = 0;
    while (this.clockMs() / 1000 < targetSec && !this.#disposed) {
      if (this.#engine.hasNext()) {
        if (!this.#engine.nextCandleOpensBefore(targetSec)) break; // gap: the bar is already complete
        this.#step();
        advancedBars += 1;
        continue;
      }
      if (!this.#loadingMore) this.#maybePrefetch(true);
      if (!this.#prefetchPromise || !this.#loadingMore) break; // end of data
      await this.#prefetchPromise;
      if (this.#error) break;
    }
    this.#emit();
    return { clockMs: this.clockMs(), advancedBars };
  }

  /** Retries loading forward data immediately (e.g. after a network or rate-limit error). */
  retryLoadMore(): void {
    this.#maybePrefetch(true);
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

  /** Restarts the replay from its starting point with a fresh account. */
  reset(): void {
    this.#playing = false;
    this.#player.stop();
    this.#engine.reset();
    this.#account = this.#newAccount();
    this.#events = [];
    this.#runId += 1;
    this.#emit();
  }

  // ---- trading ----

  /** The account, e.g. to carry balance and history into a new session (Jump to date). */
  get account(): TradingAccount {
    return this.#account;
  }

  previewOrder(order: OrderRequest): OrderPreview {
    return this.#account.previewOrder(order, this.#quote().price);
  }

  placeOrder(order: OrderRequest): OrderResult {
    if (!this.#engine.getState().atLiveEdge) {
      return { ok: false, error: 'You are reviewing past candles. Step forward to the latest candle to trade.' };
    }
    try {
      const trade = this.#account.openTrade(order, this.#quote());
      this.#pushEvent('opened', trade);
      this.#emit();
      return { ok: true, trade };
    } catch (error) {
      if (error instanceof OrderRejectedError) return { ok: false, error: error.message };
      throw error;
    }
  }

  closeTrade(tradeId: string): OrderResult {
    if (!this.#engine.getState().atLiveEdge) {
      return { ok: false, error: 'Step forward to the latest candle to close trades at market.' };
    }
    try {
      const trade = this.#account.closeTrade(tradeId, this.#quote());
      this.#pushEvent('closed', trade);
      this.#emit();
      return { ok: true, trade };
    } catch (error) {
      if (error instanceof OrderRejectedError) return { ok: false, error: error.message };
      throw error;
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#player.stop();
    this.#listeners.clear();
  }

  // ---- internals ----

  #newAccount(): TradingAccount {
    return new TradingAccount(this.setup.startingBalance, this.setup.sameCandleRule, INSTRUMENTS[this.setup.instrument]);
  }

  /** Market orders fill at the close of the latest revealed candle — nothing later is known. */
  #quote(): MarketQuote {
    const candle = this.#engine.getCurrentCandle();
    const closeTimeMs = (candle.time + GRANULARITY_SECONDS[this.setup.granularity]) * 1000;
    return { price: candle.close, time: new Date(closeTimeMs).toISOString().replace('.000Z', 'Z'), candleTime: candle.time };
  }

  #pushEvent(kind: TradeEvent['kind'], trade: Trade): void {
    this.#events = [...this.#events, { id: this.#nextEventId++, kind, trade }].slice(-MAX_EVENTS);
  }

  #step(): boolean {
    const result = this.#engine.next();
    // Trades are resolved exactly once per candle, the first time it is revealed.
    if (result?.isNew) {
      for (const trade of this.#account.processCandle(result.candle)) this.#pushEvent('closed', trade);
    }
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

  /** Fetches the next forward window when the buffer runs low. `force` skips the post-error backoff. */
  #maybePrefetch(force = false): void {
    if (this.#loadingMore || this.#dataExhausted || this.#disposed) return;
    if (this.#engine.bufferedAhead() >= PREFETCH_THRESHOLD_CANDLES) return;
    if (!force && this.#now() < this.#retryAfterMs) return;

    const fromMs = this.#loadedUntilMs;
    const toMs = Math.min(fromMs + DATA_WINDOWS[this.setup.granularity].aheadMs, this.#now());
    if (toMs <= fromMs) {
      this.#dataExhausted = true;
      return;
    }

    this.#loadingMore = true;
    this.#prefetchPromise = this.#fetchCandles(this.setup.instrument, this.setup.granularity, fromMs, toMs)
      .then((candles) => {
        if (this.#disposed) return;
        this.#loadedUntilMs = toMs;
        this.#error = null;
        this.#retryAfterMs = 0;
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
        this.#retryAfterMs = this.#now() + PREFETCH_RETRY_BACKOFF_MS;
      })
      .finally(() => {
        if (this.#disposed) return;
        this.#loadingMore = false;
        this.#prefetchPromise = null;
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
    const currentCandle = this.#engine.getCurrentCandle();
    const trades = this.#account.getTrades();
    return {
      replay: { ...replay, status: this.#playing ? 'playing' : 'paused' },
      visibleCandles: this.#engine.getVisibleCandles(),
      currentCandle,
      loadingMore: this.#loadingMore,
      dataExhausted: this.#dataExhausted && !this.#engine.hasNext(),
      canAdvance: this.#engine.hasNext() || !this.#dataExhausted,
      error: this.#error,
      runId: this.#runId,
      trades,
      stats: computeStats(trades, this.#account.startingBalance, this.#account.getEquity(this.#engine.getLiveEdgeCandle().close)),
      events: this.#events,
    };
  }
}
