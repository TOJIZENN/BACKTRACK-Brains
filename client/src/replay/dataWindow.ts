import type { Granularity } from '../types/market';

const DAY_MS = 86_400_000;

/**
 * Replays always run on 1-minute candles; the chart timeframe is an aggregated view of them.
 * That is what lets the timeframe change instantly with a live, partly formed bar (like TradingView)
 * and lets SL/TP be resolved minute by minute.
 */
export const BASE_GRANULARITY: Granularity = 'M1';
export const BASE_SECONDS = 60;

/** 1-minute history loaded before the start: enough for ~140 H1 bars of context, spanning a weekend. */
export const HISTORY_MS = 8 * DAY_MS;
/** 1-minute data fetched per forward request (within the server's per-request span limit). */
export const AHEAD_MS = 5 * DAY_MS;
/**
 * Native daily candles loaded *before* the 1-minute history, so the 1D chart has ~6 months of context.
 * They end where the 1-minute data starts (itself before the replay start), so nothing is revealed early.
 */
export const DAILY_HISTORY_MS = 180 * DAY_MS;

/** Keep at least this many bars of the chart timeframe buffered ahead (in 1-minute candles). */
const PREFETCH_AHEAD_BARS = 40;
const MIN_PREFETCH_THRESHOLD = 300;
/** Never try to keep more than ~5 days of minutes buffered (the 1D view would otherwise ask for months). */
const MAX_PREFETCH_THRESHOLD = 7200;

/** Prefetch more 1-minute data once fewer than this many unrevealed candles remain loaded. */
export function prefetchThreshold(timeframeSeconds: number): number {
  const wanted = PREFETCH_AHEAD_BARS * (timeframeSeconds / BASE_SECONDS);
  return Math.min(MAX_PREFETCH_THRESHOLD, Math.max(MIN_PREFETCH_THRESHOLD, wanted));
}

/**
 * After a failed forward fetch, automatic retries wait this long, so a provider outage or rate limit
 * (Twelve Data free plan: 8 requests/minute) is not hammered on every candle. Next/Play at the end of
 * the loaded data, or the Retry button, retry immediately.
 */
export const PREFETCH_RETRY_BACKOFF_MS = 15_000;

/** Consecutive empty forward windows tolerated (e.g. long holidays) before declaring end of data. */
export const MAX_EMPTY_FORWARD_FETCHES = 3;
