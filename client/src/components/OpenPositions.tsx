import type { ReplaySnapshot } from '../store/replaySession';
import { calculatePnl } from '../trading/pnl';
import type { InstrumentSpec } from '../types/market';
import { formatPrice, formatQuantity, formatSignedMoney } from '../utils/format';
import { Button } from './ui/Button';

interface Props {
  snapshot: ReplaySnapshot;
  instrument: InstrumentSpec;
  canClose: boolean;
  onClose: (tradeId: string) => void;
}

export function OpenPositions({ snapshot, instrument, canClose, onClose }: Props) {
  const open = snapshot.trades.filter((t) => t.status === 'OPEN');
  const mark = snapshot.currentCandle.close;
  const price = (v: number) => formatPrice(v, instrument.pricePrecision);

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-terminal-muted">
        Open positions <span className="text-terminal-text">({open.length})</span>
      </h2>
      {open.length === 0 ? (
        <p className="text-sm text-terminal-muted">No open positions.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((t) => {
            const pnl = calculatePnl(t.side, t.entryPrice, mark, t.quantity, instrument.quoteValuePerUnit);
            return (
              <li key={t.id} className="rounded-md border border-terminal-border bg-terminal-bg p-2.5 text-xs" data-testid="open-position">
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${t.side === 'LONG' ? 'text-bull' : 'text-bear'}`}>
                    #{t.number} {t.side === 'LONG' ? 'BUY' : 'SELL'} {formatQuantity(t.quantity, instrument.unitsPrecision)} oz
                  </span>
                  <span className={`font-mono ${pnl >= 0 ? 'text-bull' : 'text-bear'}`}>{formatSignedMoney(pnl)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-terminal-muted">
                  <span>
                    @{price(t.entryPrice)} · SL {price(t.stopLoss)} · TP {price(t.takeProfit)}
                  </span>
                  <Button variant="ghost" className="px-1.5 py-0.5 text-xs" disabled={!canClose} onClick={() => onClose(t.id)}>
                    Close
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
