/** Market-data sources the server can load candles from. API keys live only in the server's .env. */
export const PROVIDER_IDS = ['dukascopy', 'twelvedata', 'oanda'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const DEFAULT_PROVIDER: ProviderId = 'dukascopy';

export const PROVIDER_INFO: Record<ProviderId, { name: string; note: string }> = {
  dukascopy: { name: 'Dukascopy', note: 'Free, no API key, 1-minute history back to 2003' },
  twelvedata: { name: 'Twelve Data', note: 'Free plan: 8 requests/minute, 800/day' },
  oanda: { name: 'OANDA', note: 'Free practice account, generous limits' },
};

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}
