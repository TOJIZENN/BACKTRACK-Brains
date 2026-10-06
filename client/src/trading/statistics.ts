import { roundCents, tradeResult } from './pnl';
import type { Trade } from './types';

export interface EquityPoint {
  /** 0 = starting balance, n = after the n-th closed trade */
  index: number;
  balance: number;
  time: string | null;
}

export interface AccountStats {
  startingBalance: number;
  balance: number;
  equity: number;
  totalPnl: number;
  totalTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  /** % of closed trades that were wins; null when nothing is closed */
  winRate: number | null;
  averageR: number | null;
  /** gross profit / gross loss; Infinity with wins and no losses; null with no closed trades */
  profitFactor: number | null;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  equityCurve: EquityPoint[];
}

/** Closed trades in the order they were closed (ties broken by entry order). */
export function closedTradesInExitOrder(trades: readonly Trade[]): Trade[] {
  return trades
    .filter((t) => t.status === 'CLOSED')
    .sort((a, b) => (a.exitCandleTime ?? 0) - (b.exitCandleTime ?? 0) || a.number - b.number);
}

export function computeStats(trades: readonly Trade[], startingBalance: number, equity: number): AccountStats {
  const closed = closedTradesInExitOrder(trades);
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let sumR = 0;
  let balance = startingBalance;
  let peak = startingBalance;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  const equityCurve: EquityPoint[] = [{ index: 0, balance: startingBalance, time: null }];

  for (const trade of closed) {
    const pnl = trade.pnl ?? 0;
    const result = tradeResult(pnl);
    if (result === 'WIN') {
      wins += 1;
      grossProfit += pnl;
    } else if (result === 'LOSS') {
      losses += 1;
      grossLoss += -pnl;
    }
    sumR += trade.rMultiple ?? 0;
    balance = roundCents(balance + pnl);
    peak = Math.max(peak, balance);
    const drawdown = peak - balance;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
    }
    equityCurve.push({ index: equityCurve.length, balance, time: trade.exitTime });
  }

  const count = closed.length;
  let profitFactor: number | null = null;
  if (count > 0) profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null;

  return {
    startingBalance,
    balance,
    equity,
    totalPnl: roundCents(balance - startingBalance),
    totalTrades: count,
    openTrades: trades.length - count,
    wins,
    losses,
    breakevens: count - wins - losses,
    winRate: count > 0 ? (wins / count) * 100 : null,
    averageR: count > 0 ? sumR / count : null,
    profitFactor,
    maxDrawdown: roundCents(maxDrawdown),
    maxDrawdownPercent,
    equityCurve,
  };
}
