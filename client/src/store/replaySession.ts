import {
  AHEAD_MS,
  BASE_GRANULARITY,
  BASE_SECONDS,
  MAX_EMPTY_FORWARD_FETCHES,
  PREFETCH_RETRY_BACKOFF_MS,
  prefetchThreshold,
} from '../replay/dataWindow';
import { aggregateCandles } from '../utils/aggregate';
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
  /** Engine state, in 1-minute candles */
  replay: ReplayState & { status: PlaybackStatus };
  /** Chart timeframe; the replay itself always runs on 1-minute candles. */
  timeframe: Granularity;
  /**
   * Revealed data aggregated to the chart timeframe — the only market data the UI receives.
   * The last bar may still be forming (e.g. a 1h bar 25 minutes into the hour).
   */
  visibleCandles: readonly Candle[];
  /** Latest (possibly forming) bar of the chart timeframe */
  currentCandle: Candle;
  /** Replay clock (ms): close time of the latest revealed minute */
  clockMs: number;
  /** Time replayed since the start (ms) */
  elapsedMs: number;
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
 *
 * The engine runs on 1-minute candles. The chart timeframe is a view: Next/Previous move one bar of
 * it, trades are resolved on every minute, and changing timeframe is instant — the current bar of the
 * new timeframe simply shows as forming, built only from minutes already revealed.
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
  #disposed = false;
  #playing = false;
  #runId = 0;
  #account: TradingAccount;
  #events: TradeEvent[] = [];
  #nextEventId = 1;
  #timeframe: Granularity;
  readonly #startClockMs: number;
  #aggregated: { source: readonly Candle[]; timeframe: Granularity; bars: readonly Candle[] } | null = null;
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
    this.#timeframe = setup.granularity;
    this.#startClockMs = this.clockMs();
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

  /** Reveals one bar of the chart timeframe (completing the forming bar first). */
  next(): void {
    this.pause();
    if (this.#stepBar()) {
      this.#emit();
    } else {
      // At the end of the loaded data: an explicit Next retries loading more right away.
      this.#maybePrefetch(true);
    }
  }

  /** Steps back one bar of the chart timeframe, for review (trading resumes at the live edge). */
  previous(): void {
    this.pause();
    const seconds = this.#timeframeSeconds();
    const barStart = Math.floor(this.#engine.getCurrentCandle().time / seconds) * seconds;
    let moved = false;
    while (this.#engine.getCurrentCandle().time >= barStart && this.#engine.previous()) moved = true;
    if (moved) this.#emit();
  }

  get timeframe(): Granularity {
    return this.#timeframe;
  }

  /** Changes the chart timeframe instantly. Nothing new is revealed; the current bar may show as forming. */
  setTimeframe(timeframe: Granularity): void {
    if (timeframe === this.#timeframe) return;
    this.#timeframe = timeframe;
    this.#maybePrefetch();
    this.#emit();
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

  /** Replay clock: close time (ms) of the latest revealed minute — everything before it has "happened". */
  clockMs(): number {
    return (this.#engine.getLiveEdgeCandle().time + BASE_SECONDS) * 1000;
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
    const closeTimeMs = (candle.time + BASE_SECONDS) * 1000;
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

  #timeframeSeconds(): number {
    return GRANULARITY_SECONDS[this.#timeframe];
  }

  /**
   * Reveals minutes up to the end of the chart-timeframe bar the next minute belongs to. Stops early at
   * the end of the loaded data (the bar then stays forming and the next step completes it).
   */
  #stepBar(): boolean {
    if (!this.#step()) return false;
    const seconds = this.#timeframeSeconds();
    const barEnd = Math.floor(this.#engine.getCurrentCandle().time / seconds) * seconds + seconds;
    while (this.#engine.nextCandleOpensBefore(barEnd)) this.#step();
    return true;
  }

  /** One playback tick (one chart bar). While more data is being fetched at the end, playback waits. */
  #tick(): boolean {
    if (this.#engine.hasNext()) {
      this.#stepBar();
    } else if (!this.#loadingMore) {
      this.#playing = false;
    }
    this.#emit();
    return this.#playing;
  }

  /** Fetches the next forward window when the buffer runs low. `force` skips the post-error backoff. */
  #maybePrefetch(force = false): void {
    if (this.#loadingMore || this.#dataExhausted || this.#disposed) return;
    if (this.#engine.bufferedAhead() >= prefetchThreshold(this.#timeframeSeconds())) return;
    if (!force && this.#now() < this.#retryAfterMs) return;

    const fromMs = this.#loadedUntilMs;
    const toMs = Math.min(fromMs + AHEAD_MS, this.#now());
    if (toMs <= fromMs) {
      this.#dataExhausted = true;
      return;
    }

    this.#loadingMore = true;
    this.#fetchCandles(this.setup.instrument, BASE_GRANULARITY, fromMs, toMs)
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

  /** Revealed minutes aggregated to the chart timeframe (recomputed only when either changes). */
  #displayBars(): readonly Candle[] {
    const source = this.#engine.getVisibleCandles();
    const cached = this.#aggregated;
    if (cached && cached.source === source && cached.timeframe === this.#timeframe) return cached.bars;
    const bars =
      this.#timeframe === BASE_GRANULARITY ? source : Object.freeze(aggregateCandles(source, this.#timeframeSeconds()));
    this.#aggregated = { source, timeframe: this.#timeframe, bars };
    return bars;
  }

  #buildSnapshot(): ReplaySnapshot {
    const replay = this.#engine.getState();
    const bars = this.#displayBars();
    const trades = this.#account.getTrades();
    const clockMs = (this.#engine.getCurrentCandle().time + BASE_SECONDS) * 1000;
    return {
      replay: { ...replay, status: this.#playing ? 'playing' : 'paused' },
      timeframe: this.#timeframe,
      visibleCandles: bars,
      currentCandle: bars[bars.length - 1],
      clockMs,
      elapsedMs: Math.max(0, this.clockMs() - this.#startClockMs),
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
