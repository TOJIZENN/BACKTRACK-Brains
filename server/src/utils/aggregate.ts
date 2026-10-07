import type { Candle } from '../types/candle.js';
import { MS_PER_SECOND, toIsoSeconds } from './time.js';

/**
 * Aggregates ascending candles into `seconds`-long buckets aligned to the UTC epoch
 * (5m on :00/:05, 1h on the hour). Empty buckets produce no candle.
 */
export function aggregateCandles(candles: readonly Candle[], seconds: number): Candle[] {
  const bucketMs = seconds * MS_PER_SECOND;
  const out: Candle[] = [];
  let bucket = Number.NaN;
  for (const c of candles) {
    const t = Date.parse(c.timestamp);
    const start = Math.floor(t / bucketMs) * bucketMs;
    const last = out[out.length - 1];
    if (start !== bucket || !last) {
      bucket = start;
      out.push({ timestamp: toIsoSeconds(start), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    } else {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    }
  }
  return out;
}
