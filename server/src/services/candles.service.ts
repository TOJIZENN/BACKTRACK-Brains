import { GRANULARITY_SECONDS, OANDA_MAX_CANDLES_PER_REQUEST } from '../config/instruments.js';
import type { Candle, Granularity } from '../types/candle.js';
import { MS_PER_DAY, MS_PER_SECOND, utcDayKey, utcDaysInRange } from '../utils/time.js';
import type { CandleCache } from './candleCache.js';
import type { HistoricalCandleSource } from './oanda/oanda.service.js';

/** A day is only cached once it is safely in the past, so a partially-formed day is never frozen. */
const CACHE_SAFETY_MARGIN_MS = 60 * 60 * 1000;

export interface CandlesQuery {
  instrument: string;
  granularity: Granularity;
  fromMs: number;
  toMs: number;
}

export interface CandlesService {
  getCandles(query: CandlesQuery): Promise<Candle[]>;
}

export function maxDaysPerUpstreamRequest(granularity: Granularity): number {
  const candlesPerDay = MS_PER_DAY / (GRANULARITY_SECONDS[granularity] * MS_PER_SECOND);
  return Math.max(1, Math.floor(OANDA_MAX_CANDLES_PER_REQUEST / candlesPerDay));
}

/** Groups consecutive missing days into upstream-sized chunks. */
function chunkMissingDays(missingDays: number[], maxDays: number): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  for (const day of missingDays) {
    const last = current[current.length - 1];
    const contiguous = last === undefined || day - last === MS_PER_DAY;
    if (!contiguous || current.length >= maxDays) {
      chunks.push(current);
      current = [];
    }
    current.push(day);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function createCandlesService(
  source: HistoricalCandleSource,
  cache: CandleCache,
  now: () => number = Date.now,
): CandlesService {
  return {
    async getCandles({ instrument, granularity, fromMs, toMs }) {
      const nowMs = now();
      const effectiveTo = Math.min(toMs, nowMs);
      if (effectiveTo <= fromMs) return [];

      const days = utcDaysInRange(fromMs, effectiveTo);
      const byDay = new Map<number, Candle[]>();
      const missing: number[] = [];

      for (const day of days) {
        const cached = await cache.readDay(instrument, granularity, utcDayKey(day));
        if (cached) byDay.set(day, cached);
        else missing.push(day);
      }

      // Sequential on purpose: friendlier to OANDA rate limits than a burst of parallel requests.
      for (const chunk of chunkMissingDays(missing, maxDaysPerUpstreamRequest(granularity))) {
        const chunkStart = chunk[0];
        const chunkEnd = Math.min(chunk[chunk.length - 1] + MS_PER_DAY, nowMs);
        const fetched = await source.fetchCandles(instrument, granularity, chunkStart, chunkEnd);

        for (const day of chunk) byDay.set(day, []);
        for (const candle of fetched) {
          const day = Date.parse(candle.timestamp) - (Date.parse(candle.timestamp) % MS_PER_DAY);
          byDay.get(day)?.push(candle);
        }
        for (const day of chunk) {
          if (day + MS_PER_DAY + CACHE_SAFETY_MARGIN_MS <= nowMs) {
            await cache.writeDay(instrument, granularity, utcDayKey(day), byDay.get(day) ?? []);
          }
        }
      }

      const seen = new Set<string>();
      return days
        .flatMap((day) => byDay.get(day) ?? [])
        .filter((c) => {
          const t = Date.parse(c.timestamp);
          if (t < fromMs || t >= effectiveTo || seen.has(c.timestamp)) return false;
          seen.add(c.timestamp);
          return true;
        })
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    },
  };
}
