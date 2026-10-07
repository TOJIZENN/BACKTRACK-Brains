import type { Candle } from '../types/market';

/**
 * Aggregates ascending candles into `seconds`-long bars aligned to the UTC epoch (5m on :00/:05,
 * 1h on the hour). The last bar may be partial — that is the live, forming bar of the replay.
 */
export function aggregateCandles(candles: readonly Candle[], seconds: number): Candle[] {
  const out: Candle[] = [];
  let bucket = Number.NaN;
  for (const c of candles) {
    const start = Math.floor(c.time / seconds) * seconds;
    const last = out[out.length - 1];
    if (start !== bucket || !last) {
      bucket = start;
      out.push({ ...c, time: start, timestamp: new Date(start * 1000).toISOString().replace('.000Z', 'Z') });
    } else {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    }
  }
  return out;
}
