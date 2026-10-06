export const GRANULARITIES = ['M1', 'M5', 'M15', 'H1'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const GRANULARITY_SECONDS: Record<Granularity, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  H1: 3600,
};

/** Candle as delivered by our backend (never a provider's raw shape). */
export interface ApiCandle {
  /** Open time, ISO-8601 UTC */
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Client-side candle: the API candle plus its open time as UNIX seconds (what the chart consumes). */
export interface Candle extends ApiCandle {
  time: number;
}

export interface InstrumentSpec {
  symbol: string;
  displayName: string;
  pricePrecision: number;
  /** Contract size in "units" per 1 point of price movement → $1. For XAU_USD one unit = 1 troy oz. */
  quoteValuePerUnit: number;
  /** Decimal places allowed for position size (units) */
  unitsPrecision: number;
}

export const XAU_USD: InstrumentSpec = {
  symbol: 'XAU_USD',
  displayName: 'XAU/USD',
  pricePrecision: 3,
  quoteValuePerUnit: 1,
  unitsPrecision: 2,
};

export const INSTRUMENTS: Record<string, InstrumentSpec> = { XAU_USD };
