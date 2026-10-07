import { GRANULARITY_SECONDS } from '../../config/instruments.js';
import type { Candle, Granularity } from '../../types/candle.js';
import { MS_PER_SECOND, toIsoSeconds } from '../../utils/time.js';
import type { HistoricalCandleSource } from '../candleSource.js';
import type { TwelveDataClient } from './twelvedata.client.js';
import type { TwelveDataValue } from './twelvedata.types.js';

const INTERVALS: Record<Granularity, string> = {
  M1: '1min',
  M5: '5min',
  M15: '15min',
  H1: '1h',
  D1: '1day',
};

/** Our instrument ids ("XAU_USD") to Twelve Data symbols ("XAU/USD"). */
export function toTwelveDataSymbol(instrument: string): string {
  return instrument.replace('_', '/');
}

/** Converts a Twelve Data bar (requested with timezone=UTC) into our format, or null if malformed. */
export function normalizeTwelveDataValue(raw: TwelveDataValue): Candle | null {
  const iso = raw.datetime.length === 10 ? `${raw.datetime}T00:00:00Z` : `${raw.datetime.replace(' ', 'T')}Z`;
  const timeMs = Date.parse(iso);
  const open = Number(raw.open);
  const high = Number(raw.high);
  const low = Number(raw.low);
  const close = Number(raw.close);
  if (![timeMs, open, high, low, close].every(Number.isFinite)) return null;

  const volume = Number(raw.volume);
  return { timestamp: toIsoSeconds(timeMs), open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
}

export function createTwelveDataCandleSource(client: TwelveDataClient, now: () => number = Date.now): HistoricalCandleSource {
  return {
    async fetchCandles(instrument, granularity, fromMs, toMs) {
      const values = await client.getTimeSeries({
        symbol: toTwelveDataSymbol(instrument),
        interval: INTERVALS[granularity],
        fromMs,
        toMs,
      });
      const durationMs = GRANULARITY_SECONDS[granularity] * MS_PER_SECOND;
      const nowMs = now();
      return (
        values
          .map(normalizeTwelveDataValue)
          .filter((c): c is Candle => c !== null)
          .filter((c) => {
            const t = Date.parse(c.timestamp);
            // Twelve Data includes the still-forming latest bar; only completed candles are replayable.
            return t >= fromMs && t < toMs && t + durationMs <= nowMs;
          })
          // Defensive: never rely on the upstream sort order.
          .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      );
    },
  };
}
