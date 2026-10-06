import { describe, expect, it } from 'vitest';
import { makeCandle } from '../test/fixtures';
import { XAU_USD } from '../types/market';
import { computeStats } from './statistics';
import { OrderRejectedError, TradingAccount, type MarketQuote } from './tradingAccount';

const quoteAt = (i: number, price: number): MarketQuote => ({
  price,
  time: makeCandle(i + 1).timestamp,
  candleTime: makeCandle(i).time,
});

function account(rule: 'SL_FIRST' | 'TP_FIRST' = 'SL_FIRST') {
  return new TradingAccount(10_000, rule, XAU_USD);
}

describe('TradingAccount', () => {
  it('creates a LONG position at the quote with sized quantity', () => {
    const acc = account();
    const trade = acc.openTrade({ side: 'LONG', stopLoss: 95, takeProfit: 110, riskPercent: 1 }, quoteAt(0, 100));
    expect(trade).toMatchObject({
      id: 'trade-001',
      side: 'LONG',
      entryPrice: 100,
      stopLoss: 95,
      takeProfit: 110,
      quantity: 20,
      riskAmount: 100,
      riskRewardRatio: 2,
      status: 'OPEN',
      exitPrice: null,
      pnl: null,
    });
  });

  it('creates a SHORT position', () => {
    const trade = account().openTrade({ side: 'SHORT', stopLoss: 105, takeProfit: 90, riskPercent: 1 }, quoteAt(0, 100));
    expect(trade).toMatchObject({ side: 'SHORT', quantity: 20, status: 'OPEN' });
  });

  it('rejects invalid SL/TP', () => {
    expect(() => account().openTrade({ side: 'LONG', stopLoss: 101, takeProfit: 110, riskPercent: 1 }, quoteAt(0, 100))).toThrow(
      OrderRejectedError,
    );
    expect(() => account().openTrade({ side: 'SHORT', stopLoss: 95, takeProfit: 90, riskPercent: 1 }, quoteAt(0, 100))).toThrow(
      /stop loss must be above/,
    );
  });

  it('closes at TP: +$200, +2R, balance updates', () => {
    const acc = account();
    acc.openTrade({ side: 'LONG', stopLoss: 95, takeProfit: 110, riskPercent: 1 }, quoteAt(0, 100));
    expect(acc.processCandle(makeCandle(1, { open: 100, high: 105, low: 99, close: 104 }))).toEqual([]);
    const [closed] = acc.processCandle(makeCandle(2, { open: 104, high: 111, low: 99, close: 110 }));
    expect(closed).toMatchObject({
      status: 'CLOSED',
      exitReason: 'TAKE_PROFIT',
      exitPrice: 110,
      exitTime: makeCandle(2).timestamp,
      pnl: 200,
      rMultiple: 2,
    });
    expect(acc.getBalance()).toBe(10_200);
  });

  it('closes at SL: -$100, -1R', () => {
    const acc = account();
    acc.openTrade({ side: 'LONG', stopLoss: 95, takeProfit: 110, riskPercent: 1 }, quoteAt(0, 100));
    const [closed] = acc.processCandle(makeCandle(1, { open: 100, high: 102, low: 94, close: 96 }));
    expect(closed).toMatchObject({ exitReason: 'STOP_LOSS', pnl: -100, rMultiple: -1 });
    expect(acc.getBalance()).toBe(9_900);
  });

  it('same-candle SL/TP follows the configured rule and is flagged', () => {
    const candle = makeCandle(1, { open: 100, high: 111, low: 94, close: 100 });
    const conservative = account('SL_FIRST');
    conservative.openTrade({ side: 'LONG', stopLoss: 95, takeProfit: 110, riskPercent: 1 }, quoteAt(0, 100));
    expect(conservative.processCandle(candle)[0]).toMatchObject({ exitReason: 'STOP_LOSS', ambiguousExit: true });

    const optimistic = account('TP_FIRST');
    optimistic.openTrade({ side: 'LONG', stopLoss: 95, takeProfit: 110, riskPercent: 1 }, quoteAt(0, 100));
    expect(optimistic.processCandle(candle)[0]).toMatchObject({ exitReason: 'TAKE_PROFIT', ambiguousExit: true });
  });

  it('never resolves a trade against its own entry candle (no lookahead within the bar)', () => {
    const acc = account();
    acc.openTrade({ side: 'LONG', stopLoss: 95, takeProfit: 110, riskPercent: 1 }, quoteAt(5, 100));
    expect(acc.processCandle(makeCandle(5, { open: 100, high: 200, low: 1, close: 100 }))).toEqual([]);
    expect(acc.getOpenTrades()).toHaveLength(1);
  });

  it('manual close at market', () => {
    const acc = account();
    const t = acc.openTrade({ side: 'SHORT', stopLoss: 105, takeProfit: 90, riskPercent: 1 }, quoteAt(0, 100));
    const closed = acc.closeTrade(t.id, quoteAt(3, 97.5));
    expect(closed).toMatchObject({ exitReason: 'MANUAL', exitPrice: 97.5, pnl: 50, rMultiple: 0.5 });
    expect(() => acc.closeTrade(t.id, quoteAt(4, 97))).toThrow(OrderRejectedError);
  });

  it('marks equity with unrealized P&L', () => {
    const acc = account();
    acc.openTrade({ side: 'LONG', stopLoss: 95, takeProfit: 110, riskPercent: 1 }, quoteAt(0, 100));
    expect(acc.getEquity(102)).toBe(10_040);
    expect(acc.getBalance()).toBe(10_000);
  });

  it('sizes new trades off the current (compounded) balance', () => {
    const acc = account();
    acc.openTrade({ side: 'LONG', stopLoss: 95, takeProfit: 110, riskPercent: 1 }, quoteAt(0, 100));
    acc.processCandle(makeCandle(1, { open: 100, high: 111, low: 99, close: 110 }));
    const preview = acc.previewOrder({ side: 'LONG', stopLoss: 95, takeProfit: 110, riskPercent: 1 }, 100);
    expect(preview).toMatchObject({ riskBudget: 102, quantity: 20.4, riskAmount: 102, potentialProfit: 204, error: null });
  });
});

describe('computeStats', () => {
  it('aggregates closed trades', () => {
    const acc = account();
    const order = { stopLoss: 95, takeProfit: 110, riskPercent: 1 } as const;
    acc.openTrade({ side: 'LONG', ...order }, quoteAt(0, 100));
    acc.processCandle(makeCandle(1, { open: 100, high: 111, low: 99, close: 110 })); // +200
    acc.openTrade({ side: 'LONG', ...order }, quoteAt(1, 100));
    acc.processCandle(makeCandle(2, { open: 100, high: 101, low: 94, close: 95 })); // 20.4 oz → -102
    acc.openTrade({ side: 'LONG', ...order }, quoteAt(2, 100));
    acc.processCandle(makeCandle(3, { open: 100, high: 101, low: 94, close: 95 })); // 20.19 oz (rounded down) → -100.95

    const stats = computeStats(acc.getTrades(), acc.startingBalance, acc.getEquity(100));
    expect(stats.totalTrades).toBe(3);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(2);
    expect(stats.winRate).toBeCloseTo(33.33, 1);
    expect(stats.averageR).toBeCloseTo((2 - 1 - 1) / 3, 5);
    expect(stats.profitFactor).toBeCloseTo(200 / (102 + 100.95), 3);
    expect(stats.maxDrawdown).toBe(202.95);
    expect(stats.maxDrawdownPercent).toBeCloseTo((202.95 / 10_200) * 100, 3);
    expect(stats.equityCurve.map((p) => p.balance)).toEqual([10_000, 10_200, 10_098, 9_997.05]);
  });

  it('handles no trades and all-winners', () => {
    expect(computeStats([], 10_000, 10_000)).toMatchObject({ winRate: null, averageR: null, profitFactor: null, maxDrawdown: 0 });
    const acc = account();
    acc.openTrade({ side: 'LONG', stopLoss: 95, takeProfit: 110, riskPercent: 1 }, quoteAt(0, 100));
    acc.processCandle(makeCandle(1, { open: 100, high: 111, low: 99, close: 110 }));
    expect(computeStats(acc.getTrades(), 10_000, 10_200).profitFactor).toBe(Infinity);
  });
});
