import type { ApiCandle, Candle, Granularity } from '../types/market';
import { getJson } from './api';

interface CandlesResponse {
  candles: ApiCandle[];
}

export function toCandle(api: ApiCandle): Candle {
  return { ...api, time: Math.floor(Date.parse(api.timestamp) / 1000) };
}

/** Completed historical candles with open time in [fromMs, toMs), ascending. */
export async function fetchCandles(
  instrument: string,
  granularity: Granularity,
  fromMs: number,
  toMs: number,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const data = await getJson<CandlesResponse>(
    '/api/candles',
    {
      instrument,
      granularity,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
    },
    signal,
  );
  return data.candles.map(toCandle);
}
