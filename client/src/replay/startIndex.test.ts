import { describe, expect, it } from 'vitest';
import { makeCandles } from '../test/fixtures';
import { findStartIndex, pickRandomStartIndex } from './startIndex';

describe('findStartIndex', () => {
  const candles = makeCandles(10); // M5 candles from 2026-01-15T00:00Z
  const M5 = 300;

  it('picks the last candle that has closed by the start time', () => {
    // 00:20 → candle opening 00:15 closed at 00:20 → index 3
    expect(findStartIndex(candles, Date.parse('2026-01-15T00:20:00Z'), M5)).toBe(3);
    // 00:22 → candle 00:20 still forming → index 3
    expect(findStartIndex(candles, Date.parse('2026-01-15T00:22:00Z'), M5)).toBe(3);
  });

  it('returns -1 when nothing has closed yet', () => {
    expect(findStartIndex(candles, Date.parse('2026-01-15T00:04:00Z'), M5)).toBe(-1);
  });

  it('returns the last index when the start is after the data (e.g. weekend)', () => {
    expect(findStartIndex(candles, Date.parse('2026-01-16T00:00:00Z'), M5)).toBe(9);
  });
});

describe('pickRandomStartIndex', () => {
  it('respects history and look-ahead margins', () => {
    expect(pickRandomStartIndex(100, 10, 20, () => 0)).toBe(10);
    expect(pickRandomStartIndex(100, 10, 20, () => 0.9999)).toBe(79);
    expect(() => pickRandomStartIndex(10, 5, 5)).toThrow(RangeError);
  });
});
