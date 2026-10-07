import type { Candle } from '../types/market';

const DAY_SECONDS = 86_400;
const SUNDAY = 0;

/**
 * Start (UTC seconds) of the chart bar containing `timeSec`. Intraday bars align to the UTC epoch
 * (5m on :00/:05, 1h on the hour). Daily bars are UTC days, except that gold's short Sunday-evening
 * session is folded into Monday so the chart has no stub Sunday bar.
 */
export function bucketStart(timeSec: number, seconds: number): number {
  const start = Math.floor(timeSec / seconds) * seconds;
  if (seconds !== DAY_SECONDS) return start;
  return new Date(start * 1000).getUTCDay() === SUNDAY ? start + DAY_SECONDS : start;
}

function toBar(c: Candle, start: number): Candle {
  return { ...c, time: start, timestamp: new Date(start * 1000).toISOString().replace('.000Z', 'Z') };
}

function extend(bar: Candle, c: Candle): void {
  bar.high = Math.max(bar.high, c.high);
  bar.low = Math.min(bar.low, c.low);
  bar.close = c.close;
  bar.volume += c.volume;
}

/**
 * Aggregates ascending candles into chart bars (see `bucketStart`). The last bar may be partial —
 * that is the live, forming bar of the replay.
 */
export function aggregateCandles(candles: readonly Candle[], seconds: number): Candle[] {
  const out: Candle[] = [];
  for (const c of candles) {
    const start = bucketStart(c.time, seconds);
    const last = out[out.length - 1];
    if (last && last.time === start) extend(last, c);
    else out.push(toBar(c, start));
  }
  return out;
}

/**
 * Concatenates older bars with newer ones, combining a bar that appears on both sides of the seam
 * (e.g. a Sunday session folded into the first Monday bar).
 */
export function mergeBars(older: readonly Candle[], newer: readonly Candle[]): Candle[] {
  if (older.length === 0) return [...newer];
  if (newer.length === 0) return [...older];
  const out = older.map((c) => ({ ...c }));
  const last = out[out.length - 1];
  const [first, ...rest] = newer;
  if (first.time === last.time) extend(last, first);
  else out.push(first);
  return out.concat(rest);
}
