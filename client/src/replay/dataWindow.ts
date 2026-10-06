import type { Granularity } from '../types/market';

const DAY_MS = 86_400_000;

interface DataWindow {
  /** History loaded before the replay start, so there is context on the chart. */
  historyMs: number;
  /** Forward data fetched per request. Must stay within the server's per-request span limit. */
  aheadMs: number;
}

// Windows are wide enough to span a weekend market close in either direction.
export const DATA_WINDOWS: Record<Granularity, DataWindow> = {
  M1: { historyMs: 3 * DAY_MS, aheadMs: 3 * DAY_MS },
  M5: { historyMs: 4 * DAY_MS, aheadMs: 6 * DAY_MS },
  M15: { historyMs: 10 * DAY_MS, aheadMs: 20 * DAY_MS },
  H1: { historyMs: 40 * DAY_MS, aheadMs: 60 * DAY_MS },
};

/** Prefetch more forward data once fewer than this many unrevealed candles remain loaded. */
export const PREFETCH_THRESHOLD_CANDLES = 200;

/** Consecutive empty forward windows tolerated (e.g. long holidays) before declaring end of data. */
export const MAX_EMPTY_FORWARD_FETCHES = 3;
