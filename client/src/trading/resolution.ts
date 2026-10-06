import type { Candle } from '../types/market';
import type { ExitReason, SameCandleRule, Trade } from './types';

export interface ExitFill {
  reason: Exclude<ExitReason, 'MANUAL'>;
  price: number;
  /** Both levels were inside this candle's range and the same-candle rule decided. */
  ambiguous: boolean;
}

type OpenPosition = Pick<Trade, 'side' | 'stopLoss' | 'takeProfit'>;
type Bar = Pick<Candle, 'open' | 'high' | 'low'>;

/**
 * Decides whether a newly revealed candle closes the position, using only that candle's OHLC.
 *
 * - LONG:  SL hit if low <= SL, TP hit if high >= TP.   SHORT: SL hit if high >= SL, TP hit if low <= TP.
 * - Gap: if the candle OPENS beyond a level, the fill is the open price (the order is not reached
 *   at its exact level). This case is never ambiguous.
 * - Both touched otherwise: the sequence is unknowable from OHLC, so `rule` decides.
 */
export function resolveExit(position: OpenPosition, candle: Bar, rule: SameCandleRule): ExitFill | null {
  const isLong = position.side === 'LONG';
  const { stopLoss, takeProfit } = position;

  const gappedThroughStop = isLong ? candle.open <= stopLoss : candle.open >= stopLoss;
  if (gappedThroughStop) return { reason: 'STOP_LOSS', price: candle.open, ambiguous: false };
  const gappedThroughTarget = isLong ? candle.open >= takeProfit : candle.open <= takeProfit;
  if (gappedThroughTarget) return { reason: 'TAKE_PROFIT', price: candle.open, ambiguous: false };

  const stopHit = isLong ? candle.low <= stopLoss : candle.high >= stopLoss;
  const targetHit = isLong ? candle.high >= takeProfit : candle.low <= takeProfit;

  if (stopHit && targetHit) {
    return rule === 'SL_FIRST'
      ? { reason: 'STOP_LOSS', price: stopLoss, ambiguous: true }
      : { reason: 'TAKE_PROFIT', price: takeProfit, ambiguous: true };
  }
  if (stopHit) return { reason: 'STOP_LOSS', price: stopLoss, ambiguous: false };
  if (targetHit) return { reason: 'TAKE_PROFIT', price: takeProfit, ambiguous: false };
  return null;
}
