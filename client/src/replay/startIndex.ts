import type { Candle } from '../types/market';

/**
 * Index of the last candle that has fully CLOSED at `startMs`.
 * A candle opening at 10:00 on M5 closes at 10:05, so a 10:00 start shows candles up to the 09:55 one —
 * nothing that happened after the chosen moment is visible. Returns -1 if no candle has closed yet.
 */
export function findStartIndex(candles: readonly Candle[], startMs: number, granularitySeconds: number): number {
  const startSec = Math.floor(startMs / 1000);
  let lo = 0;
  let hi = candles.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time + granularitySeconds <= startSec) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/** Random start index that leaves at least `minHistory` candles before and `minAhead` after. */
export function pickRandomStartIndex(
  length: number,
  minHistory: number,
  minAhead: number,
  random: () => number = Math.random,
): number {
  const lo = minHistory;
  const hi = length - 1 - minAhead;
  if (hi < lo) throw new RangeError('Dataset too small for a random start with the requested margins.');
  return lo + Math.floor(random() * (hi - lo + 1));
}
