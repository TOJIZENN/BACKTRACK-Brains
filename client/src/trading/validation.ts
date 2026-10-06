import type { TradeSide } from './types';

/** Returns a user-facing error, or null when SL/TP are valid for the side. */
export function validateStops(
  side: TradeSide,
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
  pricePrecision?: number,
): string | null {
  const entry = pricePrecision === undefined ? String(entryPrice) : entryPrice.toFixed(pricePrecision);
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) return 'Enter a valid stop loss price.';
  if (!Number.isFinite(takeProfit) || takeProfit <= 0) return 'Enter a valid take profit price.';
  if (side === 'LONG') {
    if (stopLoss >= entryPrice) return `BUY: stop loss must be below entry (${entry}).`;
    if (takeProfit <= entryPrice) return `BUY: take profit must be above entry (${entry}).`;
  } else {
    if (stopLoss <= entryPrice) return `SELL: stop loss must be above entry (${entry}).`;
    if (takeProfit >= entryPrice) return `SELL: take profit must be below entry (${entry}).`;
  }
  return null;
}
