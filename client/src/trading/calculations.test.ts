import { describe, expect, it } from 'vitest';
import { XAU_USD } from '../types/market';
import { calculatePnl, calculateRMultiple, calculateRiskReward, tradeResult } from './pnl';
import { calculatePositionSize, riskAmountFor } from './positionSizing';
import { validateStops } from './validation';

describe('position sizing', () => {
  it('1% of $10,000 risks $100', () => {
    expect(riskAmountFor(10_000, 1)).toBe(100);
  });

  it('sizes so that hitting the stop loses the risk amount', () => {
    // $100 risk, 6.00 stop distance → 16.66 oz (rounded down to 0.01) → $99.96 at risk
    const size = calculatePositionSize(4321.5, 4315.5, 100, XAU_USD);
    expect(size.quantity).toBe(16.66);
    expect(size.stopDistance).toBeCloseTo(6);
    expect(size.riskAmount).toBeCloseTo(99.96);
  });

  it('exact divisions are not rounded down by float noise', () => {
    expect(calculatePositionSize(100, 95, 100, XAU_USD).quantity).toBe(20);
    expect(calculatePositionSize(2650.3, 2650.1, 10, XAU_USD).quantity).toBe(50);
  });

  it('works for shorts (stop above entry)', () => {
    expect(calculatePositionSize(100, 105, 100, XAU_USD).quantity).toBe(20);
  });

  it('returns zero size for a zero stop distance or zero risk', () => {
    expect(calculatePositionSize(100, 100, 100, XAU_USD).quantity).toBe(0);
    expect(calculatePositionSize(100, 95, 0, XAU_USD).quantity).toBe(0);
  });
});

describe('P&L and R', () => {
  it('LONG winner at 2R', () => {
    const pnl = calculatePnl('LONG', 100, 110, 20, 1);
    expect(pnl).toBe(200);
    expect(calculateRMultiple(pnl, 100)).toBe(2);
    expect(tradeResult(pnl)).toBe('WIN');
  });

  it('SHORT loser at -1R', () => {
    const pnl = calculatePnl('SHORT', 4330, 4335, 20, 1);
    expect(pnl).toBe(-100);
    expect(calculateRMultiple(pnl, 100)).toBe(-1);
    expect(tradeResult(pnl)).toBe('LOSS');
  });

  it('rounds to cents', () => {
    expect(calculatePnl('LONG', 0.1, 0.3, 3, 1)).toBe(0.6);
  });

  it('reward:risk', () => {
    expect(calculateRiskReward(4321.5, 4315.5, 4333.5)).toBe(2);
    expect(calculateRiskReward(100, 105, 90)).toBe(2);
  });
});

describe('validateStops', () => {
  it('accepts SL < entry < TP for LONG and TP < entry < SL for SHORT', () => {
    expect(validateStops('LONG', 100, 95, 110)).toBeNull();
    expect(validateStops('SHORT', 100, 105, 90)).toBeNull();
  });

  it('formats the entry with the given display precision', () => {
    expect(validateStops('LONG', 2625.88791, 2626, 2630, 3)).toBe('BUY: stop loss must be below entry (2625.888).');
  });

  it.each([
    ['LONG', 100, 101, 110, 'stop loss must be below'],
    ['LONG', 100, 100, 110, 'stop loss must be below'],
    ['LONG', 100, 95, 99, 'take profit must be above'],
    ['SHORT', 100, 95, 90, 'stop loss must be above'],
    ['SHORT', 100, 105, 101, 'take profit must be below'],
    ['LONG', 100, Number.NaN, 110, 'valid stop loss'],
    ['LONG', 100, 95, 0, 'valid take profit'],
  ] as const)('%s entry %d SL %d TP %d → "%s"', (side, entry, sl, tp, message) => {
    expect(validateStops(side, entry, sl, tp)).toContain(message);
  });
});
