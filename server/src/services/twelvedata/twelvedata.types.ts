// Raw Twelve Data shapes. Keep these inside services/twelvedata — the rest of the app uses Candle.

export interface TwelveDataValue {
  /** "YYYY-MM-DD HH:MM:SS" (intraday) in the requested timezone; we always request UTC */
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  /** Absent for most forex/commodity symbols */
  volume?: string;
}

export interface TwelveDataTimeSeriesResponse {
  status: 'ok';
  meta?: { symbol?: string; interval?: string };
  values?: TwelveDataValue[];
}

/** Twelve Data reports errors either with an HTTP status or as HTTP 200 with this body. */
export interface TwelveDataErrorResponse {
  status: 'error';
  code: number;
  message: string;
}

export interface TwelveDataTimeSeriesQuery {
  /** e.g. "XAU/USD" */
  symbol: string;
  /** e.g. "5min" */
  interval: string;
  fromMs: number;
  toMs: number;
}
