import type { TradeSide } from './types';

/** Returns a user-facing error, or null when SL/TP are valid for the side. */
export function validateStops(side: TradeSide, entryPrice: number, stopLoss: number, takeProfit: number): string | null {
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) return 'Enter a valid stop loss price.';
  if (!Number.isFinite(takeProfit) || takeProfit <= 0) return 'Enter a valid take profit price.';
  if (side === 'LONG') {
    if (stopLoss >= entryPrice) return `BUY: stop loss must be below entry (${entryPrice}).`;
    if (takeProfit <= entryPrice) return `BUY: take profit must be above entry (${entryPrice}).`;
  } else {
    if (stopLoss <= entryPrice) return `SELL: stop loss must be above entry (${entryPrice}).`;
    if (takeProfit >= entryPrice) return `SELL: take profit must be below entry (${entryPrice}).`;
  }
  return null;
}
