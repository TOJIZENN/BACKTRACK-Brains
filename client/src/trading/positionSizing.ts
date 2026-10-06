import type { InstrumentSpec } from '../types/market';

/**
 * Simulated position sizing. This is NOT broker execution: there is no margin, spread, commission
 * or minimum lot logic beyond rounding units to the instrument's precision.
 */

/** Stop distances are compared at micro-point resolution, far finer than any quote precision. */
const PRICE_DISTANCE_SCALE = 1e6;

export function riskAmountFor(balance: number, riskPercent: number): number {
  return (balance * riskPercent) / 100;
}

export interface PositionSize {
  /** Units (troy oz for XAU/USD), rounded DOWN so the real risk never exceeds the budget */
  quantity: number;
  /** Dollars actually at risk with the rounded quantity */
  riskAmount: number;
  /** |entry - stop| in price points */
  stopDistance: number;
}

export function calculatePositionSize(
  entryPrice: number,
  stopLoss: number,
  riskBudget: number,
  instrument: Pick<InstrumentSpec, 'quoteValuePerUnit' | 'unitsPrecision'>,
): PositionSize {
  // Price subtraction is noisy in floating point (2650.3 - 2650.1 = 0.20000000000027).
  const stopDistance = Math.round(Math.abs(entryPrice - stopLoss) * PRICE_DISTANCE_SCALE) / PRICE_DISTANCE_SCALE;
  if (!(stopDistance > 0) || !(riskBudget > 0)) return { quantity: 0, riskAmount: 0, stopDistance };

  const factor = 10 ** instrument.unitsPrecision;
  const rawQuantity = riskBudget / (stopDistance * instrument.quoteValuePerUnit);
  // Relative epsilon so float noise (e.g. 49.99999999) doesn't round a valid size down a step.
  const quantity = Math.floor(rawQuantity * factor * (1 + 1e-9)) / factor;
  return { quantity, riskAmount: quantity * stopDistance * instrument.quoteValuePerUnit, stopDistance };
}
