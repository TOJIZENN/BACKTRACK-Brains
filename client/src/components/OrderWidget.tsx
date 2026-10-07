import type { OrderTicket } from '../hooks/useOrderTicket';
import type { ReplaySnapshot } from '../store/replaySession';
import type { TradeSide } from '../trading/types';
import type { InstrumentSpec } from '../types/market';
import { formatMoney, formatPrice, formatQuantity } from '../utils/format';

interface Props {
  snapshot: ReplaySnapshot;
  ticket: OrderTicket;
  instrument: InstrumentSpec;
}

const SIDE_STYLES: Record<TradeSide, string> = {
  SHORT: 'bg-bear hover:bg-[#d92f3e] rounded-l-md',
  LONG: 'bg-accent hover:bg-[#1e53e5] rounded-r-md',
};

const bracketInput =
  'w-24 rounded border border-terminal-strong bg-terminal-bg/90 px-1.5 py-0.5 font-mono text-xs text-terminal-text outline-none focus:border-accent';

/**
 * TradingView-style buy/sell widget floating at the top-left of the chart:
 * [ price · SELL ] [ risk % ] [ price · BUY ], with a compact SL/TP bracket row underneath.
 * Market orders fill at the current candle's close (simulation — no spread, mid prices).
 */
export function OrderWidget({ snapshot, ticket, instrument }: Props) {
  const { values, update, previews, impliedSide, error, submit, setError } = ticket;
  const canTrade = snapshot.replay.atLiveEdge;
  const preview = previews[impliedSide ?? 'LONG'];
  const valid = impliedSide !== null && preview.error === null;
  const price = formatPrice(preview.entryPrice, instrument.pricePrecision);
  const placeholder = formatPrice(preview.entryPrice, instrument.pricePrecision);

  const sideButton = (side: TradeSide) => (
    <button
      type="button"
      onClick={() => submit(side)}
      disabled={!canTrade}
      title={canTrade ? `${side === 'LONG' ? 'Buy' : 'Sell'} at market (${side === 'LONG' ? 'B' : 'S'})` : 'Step forward to the latest candle to trade'}
      aria-label={side === 'LONG' ? 'BUY' : 'SELL'}
      className={`flex min-w-[92px] flex-col items-center px-3 py-1 text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${SIDE_STYLES[side]}`}
    >
      <span className="font-mono text-[15px] font-semibold leading-tight" data-testid={side === 'LONG' ? 'buy-price' : 'sell-price'}>
        {price}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-90">{side === 'LONG' ? 'Buy' : 'Sell'}</span>
    </button>
  );

  return (
    <div
      className="absolute left-2 top-2 z-20 flex select-none flex-col gap-1"
      data-testid="order-widget"
      // Keep clicks on the widget from reaching the chart (drawing tools / panning).
      onPointerDown={(e) => e.stopPropagation()}
      title="Simulated market order at the current candle close — mid price, no spread or commission."
    >
      <div className="flex items-stretch shadow-lg">
        {sideButton('SHORT')}
        <label className="flex w-16 flex-col items-center justify-center border-y border-terminal-strong bg-terminal-panel px-1" title="Risk per trade (% of balance)">
          <span className="flex items-baseline">
            <input
              id="ticket-risk"
              type="number"
              step="any"
              min="0.01"
              aria-label="Risk per trade (%)"
              value={values.riskPercent}
              onChange={(e) => update('riskPercent', e.target.value)}
              className="w-10 bg-transparent text-right font-mono text-sm text-terminal-text outline-none"
            />
            <span className="ml-0.5 text-xs text-terminal-muted">%</span>
          </span>
          <span className="text-[10px] uppercase tracking-wider text-terminal-muted">risk</span>
        </label>
        {sideButton('LONG')}
      </div>

      <div className="flex w-max items-center gap-2 rounded-md border border-terminal-border bg-terminal-panel/95 px-2 py-1 text-xs shadow-lg">
        <label className="flex items-center gap-1">
          <span className="font-semibold text-bear">SL</span>
          <input
            id="ticket-sl"
            type="number"
            step="any"
            aria-label="Stop loss"
            placeholder={placeholder}
            value={values.stopLoss}
            onChange={(e) => update('stopLoss', e.target.value)}
            className={`${bracketInput} focus:border-bear`}
          />
        </label>
        <label className="flex items-center gap-1">
          <span className="font-semibold text-bull">TP</span>
          <input
            id="ticket-tp"
            type="number"
            step="any"
            aria-label="Take profit"
            placeholder={placeholder}
            value={values.takeProfit}
            onChange={(e) => update('takeProfit', e.target.value)}
            className={`${bracketInput} focus:border-bull`}
          />
        </label>
        <span className="whitespace-nowrap text-terminal-muted" data-testid="ticket-summary">
          R:R <span className="font-mono text-terminal-text" data-testid="ticket-rr">{valid ? `1:${preview.riskRewardRatio.toFixed(2)}` : '—'}</span>
          {' · '}
          <span className="font-mono text-terminal-text" data-testid="ticket-risk-amount">
            {formatMoney(valid ? preview.riskAmount : preview.riskBudget)}
          </span>{' '}
          risk
          {valid && (
            <>
              {' · '}
              <span className="font-mono text-terminal-text">{formatQuantity(preview.quantity, instrument.unitsPrecision)} oz</span>
              {' · '}
              <span className="font-mono text-bull">+{formatMoney(preview.potentialProfit)}</span>
            </>
          )}
        </span>
      </div>

      {!canTrade && (
        <p className="w-max rounded bg-terminal-panel/95 px-2 py-0.5 text-xs text-warn">Reviewing past candles — step forward to trade.</p>
      )}
      {canTrade && impliedSide && preview.error && !error && (
        <p className="w-max max-w-md rounded bg-terminal-panel/95 px-2 py-0.5 text-xs text-warn">{preview.error}</p>
      )}
      {error && (
        <div role="alert" className="flex w-max max-w-md items-start gap-2 rounded border border-bear/40 bg-terminal-panel/95 px-2 py-1 text-xs">
          <span>
            <span className="font-semibold text-bear">Order rejected: </span>
            {error}
          </span>
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)} className="text-terminal-muted hover:text-terminal-text">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
