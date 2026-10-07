/** Internal candle format. Provider-specific shapes (services/oanda, services/twelvedata) never leave their folders. */
export interface Candle {
  /** Candle open time, ISO-8601 UTC, e.g. "2026-01-15T10:05:00Z" */
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const GRANULARITIES = ['M1', 'M5', 'M15', 'H1', 'D1'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export function isGranularity(value: unknown): value is Granularity {
  return typeof value === 'string' && (GRANULARITIES as readonly string[]).includes(value);
}
