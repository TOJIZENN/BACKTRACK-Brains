import type { Candle } from '../types/market';

const BASE_TIME = Date.parse('2026-01-15T00:00:00Z') / 1000;
const M5 = 300;

/** Candle at index i with flat OHLC = 100 + i unless overridden. */
export function makeCandle(i: number, ohlc: Partial<Pick<Candle, 'open' | 'high' | 'low' | 'close'>> = {}): Candle {
  const time = BASE_TIME + i * M5;
  const p = 100 + i;
  return {
    time,
    timestamp: new Date(time * 1000).toISOString().replace('.000Z', 'Z'),
    open: p,
    high: p,
    low: p,
    close: p,
    volume: 1,
    ...ohlc,
  };
}

export function makeCandles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => makeCandle(i));
}
