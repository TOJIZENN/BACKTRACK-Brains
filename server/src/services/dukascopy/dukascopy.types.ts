// Raw Dukascopy data-API shapes. Keep these inside services/dukascopy — the rest of the app uses Candle.

/**
 * Delta-encoded candle bucket (one UTC day of minute candles, or one month of hourly candles).
 * Candle i is at `timestamp + Σ times[0..i] × shift`; its prices are the running sums of the deltas
 * on top of the base `open/high/low/close`, in units of `multiplier`. Missing slots (market closed) are
 * simply skipped by the time deltas.
 */
export interface DukascopyCandleBucket {
  timestamp: number;
  multiplier: number;
  /** Candle duration in ms */
  shift: number;
  open: number;
  high: number;
  low: number;
  close: number;
  times: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

export type DukascopyPriceType = 'BID' | 'ASK';
/** "minute" buckets are UTC days; "hour" buckets are UTC months */
export type DukascopySource = 'minute' | 'hour';
