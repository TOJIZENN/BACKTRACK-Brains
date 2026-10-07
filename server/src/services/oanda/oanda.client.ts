import axios, { type AxiosError, type AxiosInstance } from 'axios';
import { config, isProviderConfigured } from '../../config/env.js';
import { HttpError } from '../../utils/httpError.js';
import { mapTransportError, missingKeyError } from '../../utils/upstreamErrors.js';
import type { OandaCandlesQuery, OandaCandlesResponse, OandaErrorResponse } from './oanda.types.js';

/**
 * Thin HTTP client for the OANDA v20 REST API.
 * Read-only by design: it only exposes historical candle retrieval. No order endpoints exist here.
 */
export interface OandaClient {
  getCandles(query: OandaCandlesQuery): Promise<OandaCandlesResponse>;
}

export function mapOandaError(error: unknown): HttpError {
  const transport = mapTransportError(error, 'OANDA');
  if (transport) return transport;

  const response = (error as AxiosError).response!;
  const status = response.status;
  const upstreamMessage = (response.data as OandaErrorResponse | undefined)?.errorMessage;
  if (status === 401 || status === 403) {
    return new HttpError(
      502,
      'INVALID_CREDENTIALS',
      'OANDA rejected the API key. Check OANDA_API_KEY and that OANDA_BASE_URL matches the key (practice vs live).',
    );
  }
  if (status === 429) {
    return new HttpError(429, 'RATE_LIMITED', 'OANDA rate limit reached. Wait a few seconds and try again.');
  }
  if (status >= 500) {
    return new HttpError(503, 'UPSTREAM_UNAVAILABLE', 'OANDA is temporarily unavailable. Please try again later.');
  }
  return new HttpError(
    502,
    'UPSTREAM_ERROR',
    `OANDA rejected the request${upstreamMessage ? `: ${upstreamMessage}` : ` (HTTP ${status})`}.`,
  );
}

export function createOandaClient(http?: AxiosInstance): OandaClient {
  const instance =
    http ??
    axios.create({
      baseURL: config.oanda.baseUrl,
      timeout: config.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.oanda.apiKey}`,
        'Accept-Datetime-Format': 'RFC3339',
      },
    });

  return {
    async getCandles({ instrument, granularity, fromMs, toMs }) {
      if (!http && !isProviderConfigured('oanda')) throw missingKeyError('OANDA', 'OANDA_API_KEY');
      try {
        const response = await instance.get<OandaCandlesResponse>(
          `/v3/instruments/${encodeURIComponent(instrument)}/candles`,
          {
            params: {
              price: 'M',
              // Our D1 is a UTC day; OANDA's default daily bar starts at 17:00 New York.
              ...(granularity === 'D1' ? { granularity: 'D', dailyAlignment: 0, alignmentTimezone: 'UTC' } : { granularity }),
              from: new Date(fromMs).toISOString(),
              to: new Date(toMs).toISOString(),
            },
          },
        );
        return response.data;
      } catch (error) {
        throw mapOandaError(error);
      }
    },
  };
}
