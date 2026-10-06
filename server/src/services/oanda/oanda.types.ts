// Raw OANDA v20 shapes. Keep these inside services/oanda — the rest of the app uses Candle.

export interface OandaCandlestickData {
  o: string;
  h: string;
  l: string;
  c: string;
}

export interface OandaCandlestick {
  /** RFC3339 with nanoseconds, e.g. "2026-01-15T10:05:00.000000000Z" */
  time: string;
  volume: number;
  complete: boolean;
  mid?: OandaCandlestickData;
}

export interface OandaCandlesResponse {
  instrument: string;
  granularity: string;
  candles: OandaCandlestick[];
}

export interface OandaErrorResponse {
  errorMessage?: string;
}

export interface OandaCandlesQuery {
  instrument: string;
  granularity: string;
  /** Inclusive start, ms epoch */
  fromMs: number;
  /** Exclusive-ish end, ms epoch (OANDA treats it as inclusive; callers filter) */
  toMs: number;
}
