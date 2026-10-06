import axios, { type AxiosError, type AxiosInstance } from 'axios';
import { config, isProviderConfigured } from '../../config/env.js';
import { HttpError } from '../../utils/httpError.js';
import { mapTransportError, missingKeyError } from '../../utils/upstreamErrors.js';
import type {
  TwelveDataErrorResponse,
  TwelveDataTimeSeriesQuery,
  TwelveDataTimeSeriesResponse,
  TwelveDataValue,
} from './twelvedata.types.js';

const PROVIDER = 'Twelve Data';
/** Twelve Data's maximum points per time_series request. */
export const TWELVE_DATA_MAX_OUTPUT_SIZE = 5000;
/** Twelve Data answers a valid request for an empty range (weekend, holiday) with this error. */
const NO_DATA_PATTERN = /no data is available/i;

/**
 * Thin HTTP client for the Twelve Data REST API.
 * Read-only market data: only the historical time_series endpoint is used.
 */
export interface TwelveDataClient {
  getTimeSeries(query: TwelveDataTimeSeriesQuery): Promise<TwelveDataValue[]>;
}

/** "2026-01-15 10:05:00" — the date format Twelve Data accepts for start_date/end_date. */
export function toTwelveDataDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function isErrorBody(data: unknown): data is TwelveDataErrorResponse {
  return typeof data === 'object' && data !== null && (data as { status?: unknown }).status === 'error';
}

/** Converts an HTTP status or body error code from Twelve Data into a typed error. */
export function mapTwelveDataStatus(code: number, message: string | undefined): HttpError {
  if (code === 401 || code === 403) {
    return new HttpError(
      502,
      'INVALID_CREDENTIALS',
      `Twelve Data rejected the API key${message ? `: ${message}` : ''}. Check TWELVE_DATA_API_KEY.`,
    );
  }
  if (code === 429) {
    return new HttpError(
      429,
      'RATE_LIMITED',
      'Twelve Data rate limit reached (the free plan allows 8 requests per minute). Wait a minute and try again.',
    );
  }
  if (code >= 500) {
    return new HttpError(503, 'UPSTREAM_UNAVAILABLE', 'Twelve Data is temporarily unavailable. Please try again later.');
  }
  return new HttpError(502, 'UPSTREAM_ERROR', `Twelve Data rejected the request${message ? `: ${message}` : ` (code ${code})`}.`);
}

export function mapTwelveDataError(error: unknown): HttpError {
  const transport = mapTransportError(error, PROVIDER);
  if (transport) return transport;
  const response = (error as AxiosError).response!;
  const body = response.data;
  return mapTwelveDataStatus(response.status, isErrorBody(body) ? body.message : undefined);
}

export function createTwelveDataClient(http?: AxiosInstance): TwelveDataClient {
  const instance = http ?? axios.create({ baseURL: config.twelveData.baseUrl, timeout: config.timeoutMs });
  // The key stays on the server: it is added here and never sent to the browser.
  const apiKey = http ? undefined : config.twelveData.apiKey;

  return {
    async getTimeSeries({ symbol, interval, fromMs, toMs }) {
      if (!http && !isProviderConfigured('twelvedata')) throw missingKeyError(PROVIDER, 'TWELVE_DATA_API_KEY');

      let data: TwelveDataTimeSeriesResponse | TwelveDataErrorResponse;
      try {
        const response = await instance.get('/time_series', {
          params: {
            symbol,
            interval,
            start_date: toTwelveDataDate(fromMs),
            end_date: toTwelveDataDate(toMs),
            timezone: 'UTC',
            order: 'ASC',
            outputsize: TWELVE_DATA_MAX_OUTPUT_SIZE,
            ...(apiKey ? { apikey: apiKey } : {}),
          },
        });
        data = response.data;
      } catch (error) {
        const body = (error as AxiosError).response?.data;
        if (isErrorBody(body) && NO_DATA_PATTERN.test(body.message)) return [];
        throw mapTwelveDataError(error);
      }

      if (isErrorBody(data)) {
        if (NO_DATA_PATTERN.test(data.message)) return [];
        throw mapTwelveDataStatus(data.code, data.message);
      }
      if (!data || (data.values !== undefined && !Array.isArray(data.values))) {
        throw new HttpError(502, 'UPSTREAM_ERROR', 'Twelve Data returned an unexpected time series response.');
      }
      return data.values ?? [];
    },
  };
}
