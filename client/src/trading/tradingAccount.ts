import type { Candle, InstrumentSpec } from '../types/market';
import { calculatePnl, calculateRMultiple, calculateRiskReward, roundCents } from './pnl';
import { calculatePositionSize, riskAmountFor } from './positionSizing';
import { resolveExit } from './resolution';
import type { ExitReason, OrderRequest, SameCandleRule, Trade } from './types';
import { validateStops } from './validation';

/** The only market information an order may use: the latest revealed candle. */
export interface MarketQuote {
  price: number;
  /** When the order is filled (close time of the current candle), ISO UTC */
  time: string;
  /** UNIX seconds of the current candle (for chart markers) */
  candleTime: number;
}

export interface OrderPreview {
  side: OrderRequest['side'];
  entryPrice: number;
  quantity: number;
  riskBudget: number;
  riskAmount: number;
  potentialProfit: number;
  riskRewardRatio: number;
  error: string | null;
}

export class OrderRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderRejectedError';
  }
}

/**
 * Simulated trading account. Trades are only ever opened at the current quote and only ever
 * resolved against candles revealed after entry, so it cannot use future information.
 */
export class TradingAccount {
  readonly startingBalance: number;
  readonly sameCandleRule: SameCandleRule;
  readonly #instrument: InstrumentSpec;
  #trades: Trade[] = [];
  #nextNumber = 1;

  constructor(startingBalance: number, sameCandleRule: SameCandleRule, instrument: InstrumentSpec) {
    this.startingBalance = startingBalance;
    this.sameCandleRule = sameCandleRule;
    this.#instrument = instrument;
  }

  /** Trades in entry order. Returns a fresh array; individual trades are immutable snapshots. */
  getTrades(): Trade[] {
    return [...this.#trades];
  }

  getOpenTrades(): Trade[] {
    return this.#trades.filter((t) => t.status === 'OPEN');
  }

  /** Starting balance plus realized P&L. */
  getBalance(): number {
    return roundCents(this.#trades.reduce((sum, t) => sum + (t.pnl ?? 0), this.startingBalance));
  }

  /** Balance plus unrealized P&L of open trades marked at `markPrice`. */
  getEquity(markPrice: number): number {
    const unrealized = this.getOpenTrades().reduce(
      (sum, t) => sum + calculatePnl(t.side, t.entryPrice, markPrice, t.quantity, this.#instrument.quoteValuePerUnit),
      0,
    );
    return roundCents(this.getBalance() + unrealized);
  }

  previewOrder(order: OrderRequest, entryPrice: number): OrderPreview {
    const riskBudget = riskAmountFor(this.getBalance(), order.riskPercent);
    const size = calculatePositionSize(entryPrice, order.stopLoss, riskBudget, this.#instrument);
    let error = validateStops(order.side, entryPrice, order.stopLoss, order.takeProfit, this.#instrument.pricePrecision);
    if (!error && !(order.riskPercent > 0)) error = 'Risk per trade must be greater than 0%.';
    if (!error && size.quantity <= 0) error = 'Risk amount is too small for this stop distance (position size rounds to 0).';
    return {
      side: order.side,
      entryPrice,
      quantity: size.quantity,
      riskBudget,
      riskAmount: roundCents(size.riskAmount),
      potentialProfit: error
        ? 0
        : calculatePnl(order.side, entryPrice, order.takeProfit, size.quantity, this.#instrument.quoteValuePerUnit),
      riskRewardRatio: calculateRiskReward(entryPrice, order.stopLoss, order.takeProfit),
      error,
    };
  }

  /** Opens a market order at the quote price. Throws OrderRejectedError when invalid. */
  openTrade(order: OrderRequest, quote: MarketQuote): Trade {
    const preview = this.previewOrder(order, quote.price);
    if (preview.error) throw new OrderRejectedError(preview.error);

    const number = this.#nextNumber++;
    const trade: Trade = {
      id: `trade-${String(number).padStart(3, '0')}`,
      number,
      side: order.side,
      entryType: 'MARKET',
      entryPrice: quote.price,
      entryTime: quote.time,
      entryCandleTime: quote.candleTime,
      quantity: preview.quantity,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      riskAmount: preview.riskAmount,
      riskRewardRatio: preview.riskRewardRatio,
      status: 'OPEN',
      exitPrice: null,
      exitTime: null,
      exitCandleTime: null,
      pnl: null,
      rMultiple: null,
      exitReason: null,
      ambiguousExit: false,
    };
    this.#trades.push(trade);
    return trade;
  }

  /**
   * Resolves open trades against a NEWLY revealed candle. Must be called once per new candle,
   * in order, and never for the candle a trade was entered on. Returns trades closed by it.
   */
  processCandle(candle: Candle): Trade[] {
    const closed: Trade[] = [];
    this.#trades = this.#trades.map((trade) => {
      if (trade.status !== 'OPEN' || candle.time <= trade.entryCandleTime) return trade;
      const fill = resolveExit(trade, candle, this.sameCandleRule);
      if (!fill) return trade;
      const result = this.#close(trade, fill.price, candle, fill.reason, fill.ambiguous);
      closed.push(result);
      return result;
    });
    return closed;
  }

  /** Manually closes a trade at the current quote. */
  closeTrade(tradeId: string, quote: MarketQuote): Trade {
    const trade = this.#trades.find((t) => t.id === tradeId);
    if (!trade || trade.status !== 'OPEN') throw new OrderRejectedError('This trade is not open.');
    const closed = this.#close(trade, quote.price, { timestamp: quote.time, time: quote.candleTime }, 'MANUAL', false);
    this.#trades = this.#trades.map((t) => (t.id === tradeId ? closed : t));
    return closed;
  }

  #close(
    trade: Trade,
    exitPrice: number,
    at: Pick<Candle, 'timestamp' | 'time'>,
    reason: ExitReason,
    ambiguous: boolean,
  ): Trade {
    const pnl = calculatePnl(trade.side, trade.entryPrice, exitPrice, trade.quantity, this.#instrument.quoteValuePerUnit);
    return {
      ...trade,
      status: 'CLOSED',
      exitPrice,
      exitTime: at.timestamp,
      exitCandleTime: at.time,
      pnl,
      rMultiple: calculateRMultiple(pnl, trade.riskAmount),
      exitReason: reason,
      ambiguousExit: ambiguous,
    };
  }
}
