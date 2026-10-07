/**
 * Converts between UTC bar times and chart "logical" indexes (0 = first loaded bar, fractional allowed).
 * Lightweight Charts can only place x-coordinates by logical index, while drawings are anchored in time
 * so they survive new bars, gaps (weekends) and re-renders — exactly like TradingView.
 */

interface Timed {
  time: number;
}

/** Logical index for a UTC time. Beyond the last bar it extrapolates by bar duration; gaps interpolate. */
export function timeToLogical(time: number, bars: readonly Timed[], barSeconds: number): number {
  const n = bars.length;
  if (n === 0) return Number.NaN;
  const first = bars[0].time;
  const last = bars[n - 1].time;
  if (time >= last) return n - 1 + (time - last) / barSeconds;
  if (time <= first) return (time - first) / barSeconds;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= time) lo = mid;
    else hi = mid;
  }
  const span = bars[hi].time - bars[lo].time;
  return lo + (span > 0 ? (time - bars[lo].time) / span : 0);
}

/** UTC time for a logical index, snapped to the nearest bar slot. */
export function logicalToTime(logical: number, bars: readonly Timed[], barSeconds: number): number {
  const n = bars.length;
  if (n === 0 || !Number.isFinite(logical)) return Number.NaN;
  const index = Math.round(logical);
  if (index < 0) return bars[0].time + index * barSeconds;
  if (index > n - 1) return bars[n - 1].time + (index - (n - 1)) * barSeconds;
  return bars[index].time;
}
