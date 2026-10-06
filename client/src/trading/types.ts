export type TradeSide = 'LONG' | 'SHORT';
export type TradeStatus = 'OPEN' | 'CLOSED';
export type ExitReason = 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL';
export type TradeResult = 'WIN' | 'LOSS' | 'BREAKEVEN';
/** Only market entries exist today; LIMIT is the planned extension point. */
export type EntryType = 'MARKET';

/**
 * What to assume when one OHLC candle touches both SL and TP and the order cannot be known.
 * SL_FIRST (conservative) is the default.
 */
export type SameCandleRule = 'SL_FIRST' | 'TP_FIRST';

export const SAME_CANDLE_RULE_LABELS: Record<SameCandleRule, string> = {
  SL_FIRST: 'Conservative — SL first',
  TP_FIRST: 'Optimistic — TP first',
};

export interface Trade {
  id: string;
  /** 1-based sequence number within the session */
  number: number;
  side: TradeSide;
  entryType: EntryType;
  entryPrice: number;
  /** Close time of the candle the trade was entered on (ISO, UTC) */
  entryTime: string;
  /** UNIX seconds of the entry candle (chart marker position) */
  entryCandleTime: number;
  /** Position size in instrument units (troy ounces for XAU/USD) */
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  /** Dollars lost if the stop loss is hit (based on the rounded quantity) */
  riskAmount: number;
  /** Planned reward-to-risk, e.g. 2 for 1:2 */
  riskRewardRatio: number;
  status: TradeStatus;
  exitPrice: number | null;
  exitTime: string | null;
  exitCandleTime: number | null;
  pnl: number | null;
  rMultiple: number | null;
  exitReason: ExitReason | null;
  /** True when SL and TP were both touched in the exit candle and the same-candle rule decided. */
  ambiguousExit: boolean;
}

export interface OrderRequest {
  side: TradeSide;
  stopLoss: number;
  takeProfit: number;
  riskPercent: number;
}
