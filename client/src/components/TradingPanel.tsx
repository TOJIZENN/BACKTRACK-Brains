import type { ReplaySnapshot } from '../store/replaySession';
import type { OrderTicket } from '../hooks/useOrderTicket';
import type { InstrumentSpec } from '../types/market';
import { formatMoney, formatPrice, formatQuantity } from '../utils/format';
import { Button } from './ui/Button';
import { ErrorBanner } from './ui/ErrorBanner';
import { Field, inputClass } from './ui/Field';
import { OpenPositions } from './OpenPositions';

interface Props {
  snapshot: ReplaySnapshot;
  ticket: OrderTicket;
  instrument: InstrumentSpec;
  onClosePosition: (tradeId: string) => void;
}

export function TradingPanel({ snapshot, ticket, instrument, onClosePosition }: Props) {
  const { values, update, previews, impliedSide, error, submit } = ticket;
  const canTrade = snapshot.replay.atLiveEdge;
  const preview = previews[impliedSide ?? 'LONG'];
  const showNumbers = impliedSide !== null && preview.error === null;
  const price = (v: number) => formatPrice(v, instrument.pricePrecision);

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-terminal-border bg-terminal-panel p-4">
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-terminal-muted">Order ticket</h2>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Risk (%)" htmlFor="ticket-risk">
              <input
                id="ticket-risk"
                type="number"
                step="any"
                min="0.01"
                className={inputClass}
                value={values.riskPercent}
                onChange={(e) => update('riskPercent', e.target.value)}
              />
            </Field>
            <Field label="Entry (market)" htmlFor="ticket-entry">
              <input
                id="ticket-entry"
                className={`${inputClass} cursor-default text-terminal-muted`}
                value={price(preview.entryPrice)}
                readOnly
                tabIndex={-1}
                title="Market orders fill at the close of the current candle"
              />
            </Field>
          </div>
          <Field label="Stop loss" htmlFor="ticket-sl">
            <input
              id="ticket-sl"
              type="number"
              step="any"
              placeholder={price(preview.entryPrice)}
              className={`${inputClass} focus:border-bear`}
              value={values.stopLoss}
              onChange={(e) => update('stopLoss', e.target.value)}
            />
          </Field>
          <Field label="Take profit" htmlFor="ticket-tp">
            <input
              id="ticket-tp"
              type="number"
              step="any"
              placeholder={price(preview.entryPrice)}
              className={`${inputClass} focus:border-bull`}
              value={values.takeProfit}
              onChange={(e) => update('takeProfit', e.target.value)}
            />
          </Field>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md border border-terminal-border bg-terminal-bg p-3 text-sm">
          <dt className="text-terminal-muted">Risk amount</dt>
          <dd className="text-right font-mono" data-testid="ticket-risk-amount">
            {showNumbers ? formatMoney(preview.riskAmount) : formatMoney(preview.riskBudget)}
          </dd>
          <dt className="text-terminal-muted">Position size</dt>
          <dd className="text-right font-mono">{showNumbers ? `${formatQuantity(preview.quantity, instrument.unitsPrecision)} oz` : '—'}</dd>
          <dt className="text-terminal-muted">Potential profit</dt>
          <dd className="text-right font-mono text-bull">{showNumbers ? formatMoney(preview.potentialProfit) : '—'}</dd>
          <dt className="text-terminal-muted">R:R</dt>
          <dd className="text-right font-mono" data-testid="ticket-rr">
            {showNumbers ? `1:${preview.riskRewardRatio.toFixed(2)}` : '—'}
          </dd>
        </dl>
        {impliedSide && preview.error && <p className="mt-2 text-xs text-gold">{preview.error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="buy"
            className="py-2.5"
            disabled={!canTrade}
            onClick={() => submit('LONG')}
            title={canTrade ? 'Buy at market (B)' : 'Step forward to the latest candle to trade'}
          >
            BUY
          </Button>
          <Button
            variant="sell"
            className="py-2.5"
            disabled={!canTrade}
            onClick={() => submit('SHORT')}
            title={canTrade ? 'Sell at market (S)' : 'Step forward to the latest candle to trade'}
          >
            SELL
          </Button>
        </div>
        {!canTrade && <p className="mt-2 text-xs text-gold">Reviewing past candles — step forward to the latest candle to trade.</p>}
        {error && (
          <div className="mt-3">
            <ErrorBanner title="Order rejected" message={error} onDismiss={() => ticket.setError(null)} />
          </div>
        )}
      </section>

      <OpenPositions snapshot={snapshot} instrument={instrument} onClose={onClosePosition} canClose={canTrade} />

      <p className="mt-auto text-[11px] leading-relaxed text-terminal-muted">
        Simulated fills at candle close, mid prices, no spread or commission. Not connected to any live account.
      </p>
    </aside>
  );
}
