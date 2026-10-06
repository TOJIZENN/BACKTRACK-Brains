import type { Candle, Granularity } from '../types/candle.js';

/** A market-data provider. Implementations normalize their own wire format into Candle. */
export interface HistoricalCandleSource {
  /** Completed candles with open time in [fromMs, toMs), ascending. */
  fetchCandles(instrument: string, granularity: Granularity, fromMs: number, toMs: number): Promise<Candle[]>;
}
