import type { TradeResult, TradeSide } from './types';

/** Price points gained in the trade's favour, before sizing. */
export function priceMove(side: TradeSide, entryPrice: number, exitPrice: number): number {
  return side === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
}

export function calculatePnl(
  side: TradeSide,
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  quoteValuePerUnit: number,
): number {
  return roundCents(priceMove(side, entryPrice, exitPrice) * quantity * quoteValuePerUnit);
}

export function calculateRMultiple(pnl: number, riskAmount: number): number {
  return riskAmount > 0 ? pnl / riskAmount : 0;
}

/** Planned reward:risk, e.g. 2 for entry 100 / SL 95 / TP 110. */
export function calculateRiskReward(entryPrice: number, stopLoss: number, takeProfit: number): number {
  const risk = Math.abs(entryPrice - stopLoss);
  return risk > 0 ? Math.abs(takeProfit - entryPrice) / risk : 0;
}

export function tradeResult(pnl: number): TradeResult {
  if (pnl > 0) return 'WIN';
  if (pnl < 0) return 'LOSS';
  return 'BREAKEVEN';
}

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}
