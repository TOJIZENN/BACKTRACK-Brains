import http from 'node:http';
import type { AddressInfo } from 'node:net';
import axios from 'axios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTwelveDataClient, mapTwelveDataStatus, toTwelveDataDate } from './twelvedata.client.js';
import { createTwelveDataCandleSource, normalizeTwelveDataValue, toTwelveDataSymbol } from './twelvedata.service.js';
import type { TwelveDataValue } from './twelvedata.types.js';

const value = (datetime: string, extra: Partial<TwelveDataValue> = {}): TwelveDataValue => ({
  datetime,
  open: '2650.10500',
  high: '2652.00000',
  low: '2649.50000',
  close: '2651.25000',
  ...extra,
});

describe('Twelve Data normalization', () => {
  it('parses UTC datetimes and string prices; missing volume becomes 0', () => {
    expect(normalizeTwelveDataValue(value('2026-01-15 10:05:00'))).toEqual({
      timestamp: '2026-01-15T10:05:00Z',
      open: 2650.105,
      high: 2652,
      low: 2649.5,
      close: 2651.25,
      volume: 0,
    });
    expect(normalizeTwelveDataValue(value('2026-01-15 10:05:00', { volume: '42' }))?.volume).toBe(42);
  });

  it('handles date-only values and rejects malformed bars', () => {
    expect(normalizeTwelveDataValue(value('2026-01-15'))?.timestamp).toBe('2026-01-15T00:00:00Z');
    expect(normalizeTwelveDataValue(value('2026-01-15 10:05:00', { close: 'n/a' }))).toBeNull();
    expect(normalizeTwelveDataValue(value('garbage'))).toBeNull();
  });

  it('maps symbols and dates to Twelve Data formats', () => {
    expect(toTwelveDataSymbol('XAU_USD')).toBe('XAU/USD');
    expect(toTwelveDataDate(Date.parse('2026-01-15T10:05:00Z'))).toBe('2026-01-15 10:05:00');
  });
});

describe('mapTwelveDataStatus', () => {
  it.each([
    [401, 'INVALID_CREDENTIALS'],
    [403, 'INVALID_CREDENTIALS'],
    [429, 'RATE_LIMITED'],
    [500, 'UPSTREAM_UNAVAILABLE'],
    [400, 'UPSTREAM_ERROR'],
    [404, 'UPSTREAM_ERROR'],
  ])('code %i → %s', (code, expected) => {
    expect(mapTwelveDataStatus(code, 'msg').code).toBe(expected);
  });
});

describe('Twelve Data client + candle source against a fake Twelve Data server', () => {
  let server: http.Server;
  let baseURL: string;
  let lastUrl = '';
  /** How the fake server responds to the next request. */
  let mode: 'ok' | 'no-data-200' | 'no-data-400' | 'bad-key-200' | 'rate-limit-429' = 'ok';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      lastUrl = req.url ?? '';
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      switch (mode) {
        case 'no-data-200':
          return send(200, { code: 400, message: 'No data is available on the specified dates. Try setting different start/end dates.', status: 'error' });
        case 'no-data-400':
          return send(400, { code: 400, message: 'No data is available on the specified dates.', status: 'error' });
        case 'bad-key-200':
          return send(200, { code: 401, message: '**apikey** parameter is incorrect or not specified.', status: 'error' });
        case 'rate-limit-429':
          return send(429, { code: 429, message: 'You have run out of API credits for the current minute.', status: 'error' });
        default:
          return send(200, {
            meta: { symbol: 'XAU/USD', interval: '5min' },
            // Deliberately unsorted, plus a bar outside the requested range.
            values: [value('2026-01-15 10:05:00'), value('2026-01-15 10:00:00'), value('2026-01-16 00:00:00')],
            status: 'ok',
          });
      }
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const FROM = Date.parse('2026-01-15T00:00:00Z');
  const TO = Date.parse('2026-01-16T00:00:00Z');
  const source = (now = () => Date.parse('2027-01-01T00:00:00Z')) =>
    createTwelveDataCandleSource(createTwelveDataClient(axios.create({ baseURL })), now);

  it('requests UTC, ascending, max-size data and returns sorted candles inside [from, to)', async () => {
    mode = 'ok';
    const candles = await source().fetchCandles('XAU_USD', 'M5', FROM, TO);
    expect(candles.map((c) => c.timestamp)).toEqual(['2026-01-15T10:00:00Z', '2026-01-15T10:05:00Z']);
    const params = new URL(lastUrl, baseURL).searchParams;
    expect(new URL(lastUrl, baseURL).pathname).toBe('/time_series');
    expect(Object.fromEntries(params)).toMatchObject({
      symbol: 'XAU/USD',
      interval: '5min',
      start_date: '2026-01-15 00:00:00',
      end_date: '2026-01-16 00:00:00',
      timezone: 'UTC',
      order: 'ASC',
      outputsize: '5000',
    });
  });

  it('drops the still-forming latest bar', async () => {
    mode = 'ok';
    const now = () => Date.parse('2026-01-15T10:07:00Z'); // the 10:05 bar closes at 10:10
    const candles = await source(now).fetchCandles('XAU_USD', 'M5', FROM, TO);
    expect(candles.map((c) => c.timestamp)).toEqual(['2026-01-15T10:00:00Z']);
  });

  it.each(['no-data-200', 'no-data-400'] as const)('treats "no data" (%s) as an empty range, e.g. a weekend', async (m) => {
    mode = m;
    await expect(source().fetchCandles('XAU_USD', 'M5', FROM, TO)).resolves.toEqual([]);
  });

  it('surfaces an invalid key reported in a 200 body', async () => {
    mode = 'bad-key-200';
    await expect(source().fetchCandles('XAU_USD', 'M5', FROM, TO)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('surfaces HTTP 429 as a rate limit', async () => {
    mode = 'rate-limit-429';
    await expect(source().fetchCandles('XAU_USD', 'M5', FROM, TO)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
