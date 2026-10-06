import { useEffect, useRef, useState } from 'react';
import type { TradeEvent } from '../store/replaySession';
import { formatPrice, formatR, formatSignedMoney } from '../utils/format';

const TOAST_DURATION_MS = 4000;

const REASON_TEXT = { STOP_LOSS: 'Stop loss hit', TAKE_PROFIT: 'Take profit hit', MANUAL: 'Closed manually' } as const;

/** Short-lived notifications for trades opened/closed by the session. Remount (key) on replay reset. */
export function TradeToasts({ events, pricePrecision }: { events: readonly TradeEvent[]; pricePrecision: number }) {
  const [visible, setVisible] = useState<TradeEvent[]>([]);
  const lastSeen = useRef(events.at(-1)?.id ?? 0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const fresh = events.filter((e) => e.id > lastSeen.current);
    if (fresh.length === 0) return;
    lastSeen.current = fresh[fresh.length - 1].id;
    setVisible((prev) => [...prev, ...fresh].slice(-4));
    const ids = new Set(fresh.map((e) => e.id));
    // Each batch owns its timer, so newer events never cancel older toasts' dismissal.
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setVisible((prev) => prev.filter((e) => !ids.has(e.id)));
    }, TOAST_DURATION_MS);
    timers.current.add(timer);
  }, [events]);

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2" aria-live="polite">
      {visible.map(({ id, kind, trade }) => {
        const label = `#${trade.number} ${trade.side === 'LONG' ? 'BUY' : 'SELL'}`;
        if (kind === 'opened') {
          return (
            <div key={id} className="rounded-md border border-terminal-border bg-terminal-raised/95 px-3 py-2 text-xs shadow-lg">
              <span className="font-semibold">{label}</span> opened @ <span className="font-mono">{formatPrice(trade.entryPrice, pricePrecision)}</span>
            </div>
          );
        }
        const won = (trade.pnl ?? 0) > 0;
        return (
          <div
            key={id}
            className={`rounded-md border px-3 py-2 text-xs shadow-lg ${won ? 'border-bull/50 bg-bull/15' : 'border-bear/50 bg-bear/15'}`}
          >
            <span className="font-semibold">{label}</span> — {trade.exitReason ? REASON_TEXT[trade.exitReason] : 'Closed'}
            {trade.ambiguousExit && ' (same-candle rule)'}:{' '}
            <span className={`font-mono font-semibold ${won ? 'text-bull' : 'text-bear'}`}>
              {formatSignedMoney(trade.pnl ?? 0)} ({formatR(trade.rMultiple ?? 0)})
            </span>
          </div>
        );
      })}
    </div>
  );
}
