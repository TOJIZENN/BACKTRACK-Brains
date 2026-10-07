import type { Granularity } from '../types/candle.js';

export interface InstrumentConfig {
  symbol: string;
  displayName: string;
  /** Decimal places used when displaying prices */
  pricePrecision: number;
  granularities: Granularity[];
}

/** Add instruments here; the rest of the stack is instrument-agnostic. */
export const INSTRUMENTS: Record<string, InstrumentConfig> = {
  XAU_USD: {
    symbol: 'XAU_USD',
    displayName: 'XAU/USD',
    pricePrecision: 3,
    granularities: ['M1', 'M5', 'M15', 'H1'],
  },
};

export const GRANULARITY_SECONDS: Record<Granularity, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  H1: 3600,
};

/** Upper bound on the span of a single /api/candles request, to keep responses reasonable. */
export const MAX_REQUEST_DAYS: Record<Granularity, number> = {
  M1: 16,
  M5: 31,
  M15: 92,
  H1: 366,
};

/** Both OANDA and Twelve Data cap a single candle request at this many candles. */
export const UPSTREAM_MAX_CANDLES_PER_REQUEST = 5000;
