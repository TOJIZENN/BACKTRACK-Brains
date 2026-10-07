import { describe, expect, it } from 'vitest';
import type { Candle } from '../types/market';
import { aggregateCandles, bucketStart, mergeBars } from './aggregate';

const D = 86_400;
const MON = Date.parse('2026-09-14T00:00:00Z') / 1000; // a Monday
const bar = (time: number, o: number, h: number, l: number, c: number, v = 1): Candle => ({
  time, timestamp: new Date(time * 1000).toISOString(), open: o, high: h, low: l, close: c, volume: v,
});

describe('bucketStart', () => {
  it('aligns intraday bars to the UTC epoch', () => {
    expect(bucketStart(MON + 3725, 3600)).toBe(MON + 3600);
    expect(bucketStart(MON + 299, 300)).toBe(MON);
  });

  it('uses UTC days and folds the Sunday session into Monday', () => {
    expect(bucketStart(MON + 10 * 3600, D)).toBe(MON);
    expect(bucketStart(MON - 2 * 3600, D)).toBe(MON); // Sunday 22:00 → Monday
    expect(bucketStart(MON - 2 * D - 3600, D)).toBe(MON - 3 * D); // Friday 23:00 → Friday
  });
});

describe('aggregateCandles / mergeBars for daily bars', () => {
  it('builds one Monday bar from the Sunday evening and Monday minutes', () => {
    const minutes = [bar(MON - 7200, 10, 12, 9, 11), bar(MON - 60, 11, 13, 10, 12), bar(MON + 60, 12, 20, 5, 15)];
    expect(aggregateCandles(minutes, D)).toEqual([{ ...bar(MON, 10, 20, 5, 15, 3), timestamp: '2026-09-14T00:00:00Z' }]);
  });

  it('combines the bar shared across the history/live seam', () => {
    const history = [bar(MON - 3 * D, 1, 2, 0.5, 1.5), bar(MON, 10, 12, 9, 11)]; // Friday, then Sunday folded into Monday
    const live = [bar(MON, 11, 20, 5, 15), bar(MON + D, 15, 16, 14, 15.5)];
    const merged = mergeBars(history, live);
    expect(merged.map((b) => b.time)).toEqual([MON - 3 * D, MON, MON + D]);
    expect(merged[1]).toMatchObject({ open: 10, high: 20, low: 5, close: 15, volume: 2 });
    expect(history[1].high).toBe(12); // inputs are not mutated
  });
});
