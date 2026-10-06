import axios, { AxiosError, type AxiosInstance } from 'axios';
import { config, isOandaConfigured } from '../../config/env.js';
import { HttpError } from '../../utils/httpError.js';
import type { OandaCandlesQuery, OandaCandlesResponse, OandaErrorResponse } from './oanda.types.js';

/**
 * Thin HTTP client for the OANDA v20 REST API.
 * Read-only by design: it only exposes historical candle retrieval. No order endpoints exist here.
 */
export interface OandaClient {
  getCandles(query: OandaCandlesQuery): Promise<OandaCandlesResponse>;
}

export function mapOandaError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (!(error instanceof AxiosError)) {
    return new HttpError(502, 'UPSTREAM_ERROR', 'Unexpected error while contacting OANDA.');
  }

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new HttpError(504, 'UPSTREAM_TIMEOUT', 'OANDA did not respond in time. Please try again.');
  }

  const status = error.response?.status;
  const upstreamMessage = (error.response?.data as OandaErrorResponse | undefined)?.errorMessage;

  if (status === undefined) {
    return new HttpError(503, 'UPSTREAM_UNAVAILABLE', 'Could not reach OANDA. Check your network connection and OANDA_BASE_URL.');
  }
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
      timeout: config.oanda.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.oanda.apiKey}`,
        'Accept-Datetime-Format': 'RFC3339',
      },
    });

  return {
    async getCandles({ instrument, granularity, fromMs, toMs }) {
      if (!http && !isOandaConfigured()) {
        throw new HttpError(
          503,
          'CONFIG_MISSING',
          'OANDA_API_KEY is not configured on the server. Copy .env.example to .env, add your key and restart the server.',
        );
      }
      try {
        const response = await instance.get<OandaCandlesResponse>(
          `/v3/instruments/${encodeURIComponent(instrument)}/candles`,
          {
            params: {
              price: 'M',
              granularity,
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
