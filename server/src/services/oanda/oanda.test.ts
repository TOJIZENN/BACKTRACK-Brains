import http from 'node:http';
import type { AddressInfo } from 'node:net';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOandaClient, mapOandaError } from './oanda.client.js';
import { createOandaCandleSource, normalizeOandaCandle } from './oanda.service.js';
import type { OandaCandlestick } from './oanda.types.js';

const raw = (time: string, complete = true): OandaCandlestick => ({
  time,
  volume: 42,
  complete,
  mid: { o: '2650.105', h: '2652.000', l: '2649.500', c: '2651.250' },
});

describe('normalizeOandaCandle', () => {
  it('converts OANDA strings to numbers and strips nanoseconds', () => {
    expect(normalizeOandaCandle(raw('2026-01-15T10:05:00.000000000Z'))).toEqual({
      timestamp: '2026-01-15T10:05:00Z',
      open: 2650.105,
      high: 2652,
      low: 2649.5,
      close: 2651.25,
      volume: 42,
    });
  });

  it('drops incomplete (still forming) candles', () => {
    expect(normalizeOandaCandle(raw('2026-01-15T10:05:00.000000000Z', false))).toBeNull();
  });

  it('drops malformed candles', () => {
    expect(normalizeOandaCandle({ ...raw('2026-01-15T10:05:00Z'), mid: { o: 'x', h: '1', l: '1', c: '1' } })).toBeNull();
    expect(normalizeOandaCandle({ time: '2026-01-15T10:05:00Z', volume: 1, complete: true })).toBeNull();
  });
});

describe('mapOandaError', () => {
  const axiosError = (status?: number, code?: string, data?: unknown) =>
    new AxiosError(
      'fail',
      code,
      undefined,
      undefined,
      status === undefined
        ? undefined
        : { status, statusText: '', data, headers: {}, config: { headers: new AxiosHeaders() } },
    );

  it.each([
    [axiosError(401), 'INVALID_CREDENTIALS'],
    [axiosError(429), 'RATE_LIMITED'],
    [axiosError(503), 'UPSTREAM_UNAVAILABLE'],
    [axiosError(undefined, 'ECONNABORTED'), 'UPSTREAM_TIMEOUT'],
    [axiosError(undefined, 'ENOTFOUND'), 'UPSTREAM_UNAVAILABLE'],
    [axiosError(400, undefined, { errorMessage: 'Invalid value' }), 'UPSTREAM_ERROR'],
  ])('maps %#', (error, code) => {
    expect(mapOandaError(error).code).toBe(code);
  });

  it('includes the upstream message for bad requests', () => {
    expect(mapOandaError(axiosError(400, undefined, { errorMessage: 'Invalid value' })).message).toContain('Invalid value');
  });
});

describe('OANDA client + candle source against a fake OANDA server', () => {
  let server: http.Server;
  let baseURL: string;
  let lastRequest: { url?: string; auth?: string } = {};

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      lastRequest = { url: req.url, auth: req.headers.authorization };
      if (req.headers.authorization !== 'Bearer good-key') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessage: 'Insufficient authorization' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          instrument: 'XAU_USD',
          granularity: 'M5',
          candles: [
            raw('2026-01-15T10:00:00.000000000Z'),
            raw('2026-01-15T10:05:00.000000000Z'),
            raw('2026-01-15T10:10:00.000000000Z', false),
          ],
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('requests mid candles and returns normalized, complete candles only', async () => {
    const http = axios.create({ baseURL, headers: { Authorization: 'Bearer good-key' } });
    const source = createOandaCandleSource(createOandaClient(http));
    const candles = await source.fetchCandles(
      'XAU_USD',
      'M5',
      Date.parse('2026-01-15T00:00:00Z'),
      Date.parse('2026-01-16T00:00:00Z'),
    );
    expect(candles.map((c) => c.timestamp)).toEqual(['2026-01-15T10:00:00Z', '2026-01-15T10:05:00Z']);
    expect(lastRequest.url).toContain('/v3/instruments/XAU_USD/candles');
    expect(lastRequest.url).toContain('price=M');
    expect(lastRequest.url).toContain('granularity=M5');
  });

  it('requests daily candles aligned to UTC midnight for D1', async () => {
    const http = axios.create({ baseURL, headers: { Authorization: 'Bearer good-key' } });
    await createOandaCandleSource(createOandaClient(http)).fetchCandles('XAU_USD', 'D1', Date.parse('2026-01-01T00:00:00Z'), Date.parse('2026-02-01T00:00:00Z'));
    expect(lastRequest.url).toContain('granularity=D&');
    expect(lastRequest.url).toContain('dailyAlignment=0');
    expect(lastRequest.url).toContain('alignmentTimezone=UTC');
  });

  it('surfaces invalid credentials as a typed error', async () => {
    const http = axios.create({ baseURL, headers: { Authorization: 'Bearer bad-key' } });
    const source = createOandaCandleSource(createOandaClient(http));
    await expect(source.fetchCandles('XAU_USD', 'M5', 0, 1000)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});
