import { describe, expect, it, vi } from 'vitest';
import type { Candle, Granularity } from '../types/candle.js';
import { MS_PER_DAY, toIsoSeconds } from '../utils/time.js';
import type { CandleCache } from './candleCache.js';
import { createCandlesService, maxDaysPerUpstreamRequest } from './candles.service.js';
import type { HistoricalCandleSource } from './oanda/oanda.service.js';

const DAY = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const HOUR_MS = 3_600_000;

/** One H1 candle per hour for the requested range — a stand-in for OANDA. */
function fakeSource() {
  const fetchCandles = vi.fn(async (_i: string, _g: Granularity, fromMs: number, toMs: number) => {
    const out: Candle[] = [];
    for (let t = fromMs; t < toMs; t += HOUR_MS) {
      out.push({ timestamp: toIsoSeconds(t), open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 });
    }
    return out;
  });
  return { fetchCandles } satisfies HistoricalCandleSource;
}

function memoryCache() {
  const store = new Map<string, Candle[]>();
  const cache: CandleCache = {
    readDay: vi.fn(async (i, g, d) => store.get(`${i}/${g}/${d}`) ?? null),
    writeDay: vi.fn(async (i, g, d, c) => void store.set(`${i}/${g}/${d}`, c)),
  };
  return { cache, store };
}

describe('maxDaysPerUpstreamRequest', () => {
  it('keeps every upstream request under 5000 candles', () => {
    expect(maxDaysPerUpstreamRequest('M1')).toBe(3);
    expect(maxDaysPerUpstreamRequest('M5')).toBe(17);
    expect(maxDaysPerUpstreamRequest('H1')).toBe(208);
  });
});

describe('candles service', () => {
  const now = () => DAY('2026-02-01');

  it('returns sorted candles within [from, to) and caches completed days', async () => {
    const source = fakeSource();
    const { cache, store } = memoryCache();
    const service = createCandlesService(source, cache, now);

    const candles = await service.getCandles({
      instrument: 'XAU_USD',
      granularity: 'H1',
      fromMs: DAY('2026-01-10') + 5 * HOUR_MS,
      toMs: DAY('2026-01-12') + 2 * HOUR_MS,
    });

    expect(candles[0].timestamp).toBe('2026-01-10T05:00:00Z');
    expect(candles[candles.length - 1].timestamp).toBe('2026-01-12T01:00:00Z');
    expect(candles).toHaveLength(19 + 24 + 2);
    expect(source.fetchCandles).toHaveBeenCalledTimes(1);
    expect([...store.keys()]).toEqual(['XAU_USD/H1/2026-01-10', 'XAU_USD/H1/2026-01-11', 'XAU_USD/H1/2026-01-12']);
    expect(store.get('XAU_USD/H1/2026-01-10')).toHaveLength(24);
  });

  it('serves repeated requests from the cache without calling OANDA', async () => {
    const source = fakeSource();
    const { cache } = memoryCache();
    const service = createCandlesService(source, cache, now);
    const query = { instrument: 'XAU_USD', granularity: 'H1' as const, fromMs: DAY('2026-01-10'), toMs: DAY('2026-01-11') };

    const first = await service.getCandles(query);
    const second = await service.getCandles(query);
    expect(second).toEqual(first);
    expect(source.fetchCandles).toHaveBeenCalledTimes(1);
  });

  it('splits missing days into chunks that respect the upstream limit', async () => {
    const source = fakeSource();
    const { cache } = memoryCache();
    const service = createCandlesService(source, cache, now);

    await service.getCandles({ instrument: 'XAU_USD', granularity: 'M1', fromMs: DAY('2026-01-01'), toMs: DAY('2026-01-08') });
    // 7 days at max 3 days/request → 3 requests
    expect(source.fetchCandles).toHaveBeenCalledTimes(3);
    for (const [, , from, to] of source.fetchCandles.mock.calls) expect(to - from).toBeLessThanOrEqual(3 * MS_PER_DAY);
  });

  it('never requests the future and never caches the current day', async () => {
    const source = fakeSource();
    const { cache, store } = memoryCache();
    const nowMs = DAY('2026-02-01') + 10 * HOUR_MS;
    const service = createCandlesService(source, cache, () => nowMs);

    const candles = await service.getCandles({
      instrument: 'XAU_USD',
      granularity: 'H1',
      fromMs: DAY('2026-01-31'),
      toMs: DAY('2026-02-03'),
    });
    expect(candles).toHaveLength(24 + 10);
    expect(source.fetchCandles.mock.calls[0][3]).toBe(nowMs);
    expect([...store.keys()]).toEqual(['XAU_USD/H1/2026-01-31']);
  });

  it('caches empty days (weekends) so they are not refetched', async () => {
    const source: HistoricalCandleSource = { fetchCandles: vi.fn(async () => []) };
    const { cache, store } = memoryCache();
    const service = createCandlesService(source, cache, now);
    const query = { instrument: 'XAU_USD', granularity: 'M5' as const, fromMs: DAY('2026-01-17'), toMs: DAY('2026-01-19') };

    expect(await service.getCandles(query)).toEqual([]);
    await service.getCandles(query);
    expect(source.fetchCandles).toHaveBeenCalledTimes(1);
    expect(store.get('XAU_USD/M5/2026-01-17')).toEqual([]);
  });
});
