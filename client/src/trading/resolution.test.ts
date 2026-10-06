import { describe, expect, it } from 'vitest';
import { resolveExit } from './resolution';

const long = { side: 'LONG' as const, stopLoss: 95, takeProfit: 110 };
const short = { side: 'SHORT' as const, stopLoss: 105, takeProfit: 90 };
const bar = (open: number, high: number, low: number) => ({ open, high, low });

describe('resolveExit — LONG (entry 100, SL 95, TP 110)', () => {
  it('TP hit: high 111, low 99', () => {
    expect(resolveExit(long, bar(100, 111, 99), 'SL_FIRST')).toEqual({ reason: 'TAKE_PROFIT', price: 110, ambiguous: false });
  });

  it('SL hit: high 102, low 94', () => {
    expect(resolveExit(long, bar(100, 102, 94), 'SL_FIRST')).toEqual({ reason: 'STOP_LOSS', price: 95, ambiguous: false });
  });

  it('same candle, conservative: high 111, low 94 → SL', () => {
    expect(resolveExit(long, bar(100, 111, 94), 'SL_FIRST')).toEqual({ reason: 'STOP_LOSS', price: 95, ambiguous: true });
  });

  it('same candle, optimistic: high 111, low 94 → TP', () => {
    expect(resolveExit(long, bar(100, 111, 94), 'TP_FIRST')).toEqual({ reason: 'TAKE_PROFIT', price: 110, ambiguous: true });
  });

  it('touching the level exactly counts as hit', () => {
    expect(resolveExit(long, bar(100, 110, 99), 'SL_FIRST')?.reason).toBe('TAKE_PROFIT');
    expect(resolveExit(long, bar(100, 101, 95), 'SL_FIRST')?.reason).toBe('STOP_LOSS');
  });

  it('nothing hit inside the range', () => {
    expect(resolveExit(long, bar(100, 109.99, 95.01), 'SL_FIRST')).toBeNull();
  });

  it('gap below the stop fills at the open, not at the stop', () => {
    expect(resolveExit(long, bar(93, 112, 92), 'TP_FIRST')).toEqual({ reason: 'STOP_LOSS', price: 93, ambiguous: false });
  });

  it('gap above the target fills at the open', () => {
    expect(resolveExit(long, bar(112, 113, 90), 'SL_FIRST')).toEqual({ reason: 'TAKE_PROFIT', price: 112, ambiguous: false });
  });
});

describe('resolveExit — SHORT (entry 100, SL 105, TP 90)', () => {
  it('SL hit when high >= SL', () => {
    expect(resolveExit(short, bar(100, 105.5, 98), 'SL_FIRST')).toEqual({ reason: 'STOP_LOSS', price: 105, ambiguous: false });
  });

  it('TP hit when low <= TP', () => {
    expect(resolveExit(short, bar(100, 101, 89), 'SL_FIRST')).toEqual({ reason: 'TAKE_PROFIT', price: 90, ambiguous: false });
  });

  it('same candle uses the configured rule', () => {
    expect(resolveExit(short, bar(100, 106, 89), 'SL_FIRST')?.reason).toBe('STOP_LOSS');
    expect(resolveExit(short, bar(100, 106, 89), 'TP_FIRST')?.reason).toBe('TAKE_PROFIT');
  });

  it('gap above the stop fills at the open', () => {
    expect(resolveExit(short, bar(107, 108, 89), 'TP_FIRST')).toEqual({ reason: 'STOP_LOSS', price: 107, ambiguous: false });
  });
});
