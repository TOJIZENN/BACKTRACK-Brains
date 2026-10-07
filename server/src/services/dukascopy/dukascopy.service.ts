import { GRANULARITY_SECONDS } from '../../config/instruments.js';
import type { Candle, Granularity } from '../../types/candle.js';
import { aggregateCandles } from '../../utils/aggregate.js';
import { MS_PER_SECOND, toIsoSeconds } from '../../utils/time.js';
import type { HistoricalCandleSource } from '../candleSource.js';
import type { DukascopyClient } from './dukascopy.client.js';
import type { DukascopyCandleBucket, DukascopySource } from './dukascopy.types.js';

/** Parallel bucket requests — polite to a free service while keeping loads quick. */
const MAX_CONCURRENT_REQUESTS = 4;

interface RawCandle {
  timeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Our instrument ids ("XAU_USD") to Dukascopy codes ("XAU-USD"). */
export function toDukascopyCode(instrument: string): string {
  return instrument.replace('_', '-');
}

function decimals(multiplier: number): number {
  const [coefficient, exponent = '0'] = multiplier.toString().toLowerCase().split('e');
  return Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent));
}

/** Decodes a delta-encoded bucket into absolute candles (closed-market gaps are left out). */
export function decodeBucket(b: DukascopyCandleBucket): RawCandle[] {
  const scale = decimals(b.multiplier);
  const price = (units: number) => Number((units * b.multiplier).toFixed(scale));
  let time = b.timestamp;
  let o = Math.round(b.open / b.multiplier);
  let h = Math.round(b.high / b.multiplier);
  let l = Math.round(b.low / b.multiplier);
  let c = Math.round(b.close / b.multiplier);
  const out: RawCandle[] = [];
  for (let i = 0; i < b.times.length; i++) {
    time += b.times[i] * b.shift;
    o += b.opens[i];
    h += b.highs[i];
    l += b.lows[i];
    c += b.closes[i];
    out.push({ timeMs: time, open: price(o), high: price(h), low: price(l), close: price(c), volume: b.volumes[i] ?? 0 });
  }
  return out;
}

/** Mid candles from matching bid/ask candles; volume-less (no-trade) minutes are dropped. */
export function mergeMid(bid: RawCandle[], ask: RawCandle[], precision: number): Candle[] {
  const asks = new Map(ask.map((a) => [a.timeMs, a]));
  const mid = (x: number, y: number) => Number(((x + y) / 2).toFixed(precision));
  const out: Candle[] = [];
  for (const b of bid) {
    if (b.volume === 0) continue;
    const a = asks.get(b.timeMs) ?? b;
    out.push({
      timestamp: toIsoSeconds(b.timeMs),
      open: mid(b.open, a.open),
      high: mid(b.high, a.high),
      low: mid(b.low, a.low),
      close: mid(b.close, a.close),
      volume: b.volume,
    });
  }
  return out;
}

/** UTC bucket starts (days or months) overlapping [fromMs, toMs). */
export function bucketStarts(source: DukascopySource, fromMs: number, toMs: number): number[] {
  const starts: number[] = [];
  const d = new Date(fromMs);
  let cursor = source === 'minute' ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth());
  while (cursor < toMs) {
    starts.push(cursor);
    const c = new Date(cursor);
    cursor = source === 'minute' ? Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate() + 1) : Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1);
  }
  return starts;
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

const PRICE_PRECISION = 3;

/**
 * Dukascopy candle source. M1/M5/M15 come from daily minute buckets (M5/M15 aggregated from M1 so all
 * timeframes agree); H1 comes from monthly hour buckets. Prices are mid (average of bid and ask).
 */
export function createDukascopyCandleSource(client: DukascopyClient, now: () => number = Date.now): HistoricalCandleSource {
  return {
    async fetchCandles(instrument, granularity: Granularity, fromMs, toMs) {
      const code = toDukascopyCode(instrument);
      const source: DukascopySource = granularity === 'H1' ? 'hour' : 'minute';
      const buckets = bucketStarts(source, fromMs, Math.min(toMs, now()));

      const perBucket = await mapLimited(buckets, MAX_CONCURRENT_REQUESTS, async (start) => {
        const [bid, ask] = await Promise.all([
          client.getCandleBucket(code, source, 'BID', start),
          client.getCandleBucket(code, source, 'ASK', start),
        ]);
        return bid ? mergeMid(decodeBucket(bid), ask ? decodeBucket(ask) : [], PRICE_PRECISION) : [];
      });

      const base = perBucket.flat().sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
      const candles = granularity === 'M1' || granularity === 'H1' ? base : aggregateCandles(base, GRANULARITY_SECONDS[granularity]);
      const durationMs = GRANULARITY_SECONDS[granularity] * MS_PER_SECOND;
      const nowMs = now();
      // Only completed candles inside the requested range.
      return candles.filter((c) => {
        const t = Date.parse(c.timestamp);
        return t >= fromMs && t < toMs && t + durationMs <= nowMs;
      });
    },
  };
}
