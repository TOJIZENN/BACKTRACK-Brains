import axios, { type AxiosError, type AxiosInstance } from 'axios';
import { config } from '../../config/env.js';
import { HttpError } from '../../utils/httpError.js';
import { mapTransportError } from '../../utils/upstreamErrors.js';
import type { DukascopyCandleBucket, DukascopyPriceType, DukascopySource } from './dukascopy.types.js';

const PROVIDER = 'Dukascopy';

/** Read-only client for Dukascopy's free historical data API (no key required). */
export interface DukascopyClient {
  /** One bucket starting at `bucketStartMs` (UTC day for minute, UTC month for hour); null when no data. */
  getCandleBucket(code: string, source: DukascopySource, price: DukascopyPriceType, bucketStartMs: number): Promise<DukascopyCandleBucket | null>;
}

function bucketEnd(source: DukascopySource, startMs: number): number {
  const d = new Date(startMs);
  return source === 'minute'
    ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
    : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

/**
 * Completed buckets have stable paths (…/YYYY/M/D for minutes, …/YYYY/M for hours, month 1-based);
 * the still-open bucket is requested with `?from=<bucket start>`.
 */
export function bucketPath(code: string, source: DukascopySource, price: DukascopyPriceType, bucketStartMs: number, nowMs: number): string {
  const base = `/candles/${source}/${code}/${price}`;
  if (nowMs >= bucketStartMs && nowMs < bucketEnd(source, bucketStartMs)) return `${base}?from=${bucketStartMs}`;
  const d = new Date(bucketStartMs);
  const ym = `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}`;
  return source === 'minute' ? `${base}/${ym}/${d.getUTCDate()}` : `${base}/${ym}`;
}

export function mapDukascopyError(error: unknown): HttpError {
  const transport = mapTransportError(error, PROVIDER);
  if (transport) return transport;
  const status = (error as AxiosError).response!.status;
  if (status === 429) return new HttpError(429, 'RATE_LIMITED', 'Dukascopy is throttling requests. Wait a few seconds and try again.');
  if (status >= 500) return new HttpError(503, 'UPSTREAM_UNAVAILABLE', 'Dukascopy is temporarily unavailable. Please try again later.');
  return new HttpError(502, 'UPSTREAM_ERROR', `Dukascopy rejected the request (HTTP ${status}).`);
}

function isBucket(data: unknown): data is DukascopyCandleBucket {
  return typeof data === 'object' && data !== null && Array.isArray((data as DukascopyCandleBucket).times);
}

export function createDukascopyClient(http?: AxiosInstance, now: () => number = Date.now): DukascopyClient {
  const instance = http ?? axios.create({ baseURL: config.dukascopy.baseUrl, timeout: config.timeoutMs });
  return {
    async getCandleBucket(code, source, price, bucketStartMs) {
      try {
        const response = await instance.get(bucketPath(code, source, price, bucketStartMs, now()), { responseType: 'json' });
        const data: unknown = response.data;
        if (data === '' || data === null || data === undefined) return null;
        if (!isBucket(data)) throw new HttpError(502, 'UPSTREAM_ERROR', 'Dukascopy returned an unexpected candle response.');
        return data.times.length === 0 ? null : data;
      } catch (error) {
        // Days/months without data (weekends, holidays, before history starts) may be 404s.
        if ((error as AxiosError).response?.status === 404) return null;
        throw mapDukascopyError(error);
      }
    },
  };
}
