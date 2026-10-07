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
  /** Market-data source; omitted → the server's default (DATA_PROVIDER) */
  provider?: string,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const data = await getJson<CandlesResponse>(
    '/api/candles',
    {
      instrument,
      granularity,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      ...(provider ? { provider } : {}),
    },
    signal,
  );
  return data.candles.map(toCandle);
}
