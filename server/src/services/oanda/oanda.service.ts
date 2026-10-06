import type { Candle, Granularity } from '../../types/candle.js';
import { toIsoSeconds } from '../../utils/time.js';
import { HttpError } from '../../utils/httpError.js';
import type { OandaClient } from './oanda.client.js';
import type { OandaCandlestick } from './oanda.types.js';

/** Converts an OANDA candle to our internal format. Returns null for incomplete/malformed candles. */
export function normalizeOandaCandle(raw: OandaCandlestick): Candle | null {
  if (!raw.complete || !raw.mid) return null;

  // OANDA uses nanosecond precision, which Date cannot parse reliably everywhere.
  const timeMs = Date.parse(raw.time.replace(/\.\d+Z$/, 'Z'));
  const open = Number(raw.mid.o);
  const high = Number(raw.mid.h);
  const low = Number(raw.mid.l);
  const close = Number(raw.mid.c);

  if (![timeMs, open, high, low, close].every(Number.isFinite)) return null;

  return { timestamp: toIsoSeconds(timeMs), open, high, low, close, volume: raw.volume ?? 0 };
}

export interface HistoricalCandleSource {
  /** Completed candles with open time in [fromMs, toMs), ascending. */
  fetchCandles(instrument: string, granularity: Granularity, fromMs: number, toMs: number): Promise<Candle[]>;
}

export function createOandaCandleSource(client: OandaClient): HistoricalCandleSource {
  return {
    async fetchCandles(instrument, granularity, fromMs, toMs) {
      const response = await client.getCandles({ instrument, granularity, fromMs, toMs });
      if (!response || !Array.isArray(response.candles)) {
        throw new HttpError(502, 'UPSTREAM_ERROR', 'OANDA returned an unexpected candle response.');
      }
      return response.candles
        .map(normalizeOandaCandle)
        .filter((c): c is Candle => c !== null)
        .filter((c) => {
          const t = Date.parse(c.timestamp);
          return t >= fromMs && t < toMs;
        });
    },
  };
}
