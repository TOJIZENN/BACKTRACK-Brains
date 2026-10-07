import http from 'node:http';
import type { AddressInfo } from 'node:net';
import axios from 'axios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aggregateCandles } from '../../utils/aggregate.js';
import { bucketPath, createDukascopyClient } from './dukascopy.client.js';
import { bucketStarts, createDukascopyCandleSource, decodeBucket, mergeMid, toDukascopyCode } from './dukascopy.service.js';
import type { DukascopyCandleBucket } from './dukascopy.types.js';

const MIN = 60_000;
const DAY = Date.parse('2026-09-15T00:00:00Z');

/** Encodes absolute candles into Dukascopy's delta format (test helper / fake server). */
function encodeBucket(bucketStart: number, shift: number, candles: { t: number; o: number; h: number; l: number; c: number; v: number }[]): DukascopyCandleBucket {
  const m = 0.001;
  const units = (p: number) => Math.round(p / m);
  const base = candles[0];
  let prevSlot = 0;
  let prev = { o: units(base.o), h: units(base.h), l: units(base.l), c: units(base.c) };
  const enc: DukascopyCandleBucket = {
    timestamp: bucketStart, multiplier: m, shift, open: base.o, high: base.h, low: base.l, close: base.c,
    times: [], opens: [], highs: [], lows: [], closes: [], volumes: [],
  };
  candles.forEach((c) => {
    const slot = (c.t - bucketStart) / shift;
    enc.times.push(slot - prevSlot);
    prevSlot = slot;
    const u = { o: units(c.o), h: units(c.h), l: units(c.l), c: units(c.c) };
    enc.opens.push(u.o - prev.o); enc.highs.push(u.h - prev.h); enc.lows.push(u.l - prev.l); enc.closes.push(u.c - prev.c);
    enc.volumes.push(c.v);
    prev = u;
  });
  return enc;
}

const sample = [
  { t: DAY + 10 * MIN, o: 2650.1, h: 2651, l: 2649.5, c: 2650.8, v: 3 },
  { t: DAY + 11 * MIN, o: 2650.8, h: 2652.25, l: 2650.2, c: 2652, v: 5 },
  { t: DAY + 15 * MIN, o: 2652, h: 2652.5, l: 2651.1, c: 2651.4, v: 0 }, // no-trade minute → dropped
];

describe('Dukascopy decoding', () => {
  it('decodes delta-encoded candles and skips closed-market gaps', () => {
    const decoded = decodeBucket(encodeBucket(DAY, MIN, sample));
    expect(decoded.map((c) => (c.timeMs - DAY) / MIN)).toEqual([10, 11, 15]);
    expect(decoded[1]).toEqual({ timeMs: DAY + 11 * MIN, open: 2650.8, high: 2652.25, low: 2650.2, close: 2652, volume: 5 });
  });

  it('averages bid and ask into mid prices and drops zero-volume minutes', () => {
    const bid = decodeBucket(encodeBucket(DAY, MIN, sample));
    const ask = decodeBucket(encodeBucket(DAY, MIN, sample.map((c) => ({ ...c, o: c.o + 0.3, h: c.h + 0.3, l: c.l + 0.3, c: c.c + 0.3 }))));
    const mid = mergeMid(bid, ask, 3);
    expect(mid).toHaveLength(2);
    expect(mid[0]).toEqual({ timestamp: '2026-09-15T00:10:00Z', open: 2650.25, high: 2651.15, low: 2649.65, close: 2650.95, volume: 3 });
  });

  it('builds completed and active bucket paths (1-based months, no padding)', () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    expect(bucketPath('XAU-USD', 'minute', 'BID', DAY, now)).toBe('/candles/minute/XAU-USD/BID/2026/9/15');
    expect(bucketPath('XAU-USD', 'hour', 'ASK', Date.parse('2026-09-01T00:00:00Z'), now)).toBe('/candles/hour/XAU-USD/ASK/2026/9');
    const today = Date.parse('2026-10-07T00:00:00Z');
    expect(bucketPath('XAU-USD', 'minute', 'BID', today, now)).toBe(`/candles/minute/XAU-USD/BID?from=${today}`);
    expect(toDukascopyCode('XAU_USD')).toBe('XAU-USD');
  });

  it('enumerates UTC day and month buckets', () => {
    expect(bucketStarts('minute', DAY + 5 * MIN, DAY + 2 * 86_400_000)).toEqual([DAY, DAY + 86_400_000]);
    expect(bucketStarts('hour', Date.parse('2026-08-20T00:00:00Z'), Date.parse('2026-10-02T00:00:00Z')).map((t) => new Date(t).toISOString().slice(0, 7))).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('aggregates M1 into epoch-aligned buckets', () => {
    const m1 = [0, 1, 4, 5, 9].map((i) => ({ timestamp: new Date(DAY + i * MIN).toISOString().replace('.000Z', 'Z'), open: i, high: i + 1, low: i - 1, close: i + 0.5, volume: 1 }));
    expect(aggregateCandles(m1, 300)).toEqual([
      { timestamp: '2026-09-15T00:00:00Z', open: 0, high: 5, low: -1, close: 4.5, volume: 3 },
      { timestamp: '2026-09-15T00:05:00Z', open: 5, high: 10, low: 4, close: 9.5, volume: 2 },
    ]);
  });
});

describe('Dukascopy source against a fake data API', () => {
  let server: http.Server;
  let baseURL: string;
  const requests: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requests.push(req.url ?? '');
      const m = /\/candles\/minute\/XAU-USD\/(BID|ASK)\/2026\/9\/15$/.exec(req.url ?? '');
      if (!m) {
        res.writeHead(404);
        return res.end();
      }
      const shiftPrice = m[1] === 'ASK' ? 0.3 : 0;
      const candles = Array.from({ length: 12 }, (_, i) => ({ t: DAY + (600 + i) * MIN, o: 2650 + i + shiftPrice, h: 2651 + i + shiftPrice, l: 2649 + i + shiftPrice, c: 2650.5 + i + shiftPrice, v: 1 }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(encodeBucket(DAY, MIN, candles)));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const source = () => {
    const now = () => Date.parse('2026-10-07T00:00:00Z');
    return createDukascopyCandleSource(createDukascopyClient(axios.create({ baseURL }), now), now);
  };

  it('fetches bid+ask day buckets and returns mid M1 candles in range', async () => {
    const candles = await source().fetchCandles('XAU_USD', 'M1', DAY + 600 * MIN, DAY + 605 * MIN);
    expect(candles.map((c) => c.timestamp)).toEqual(['2026-09-15T10:00:00Z', '2026-09-15T10:01:00Z', '2026-09-15T10:02:00Z', '2026-09-15T10:03:00Z', '2026-09-15T10:04:00Z']);
    expect(candles[0].open).toBe(2650.15);
    expect(requests.some((u) => u.endsWith('/BID/2026/9/15'))).toBe(true);
    expect(requests.some((u) => u.endsWith('/ASK/2026/9/15'))).toBe(true);
  });

  it('aggregates M5 from M1 and treats missing days (404) as empty', async () => {
    const m5 = await source().fetchCandles('XAU_USD', 'M5', DAY, DAY + 2 * 86_400_000);
    expect(m5.map((c) => c.timestamp)).toEqual(['2026-09-15T10:00:00Z', '2026-09-15T10:05:00Z', '2026-09-15T10:10:00Z']);
    expect(m5[0]).toMatchObject({ open: 2650.15, high: 2655.15, low: 2649.15, close: 2654.65, volume: 5 });
  });
});
