import { useState } from 'react';
import { calculatePnl, calculateRMultiple, tradeResult } from '../trading/pnl';
import type { ExitReason, Trade } from '../trading/types';
import type { InstrumentSpec } from '../types/market';
import { useTimeZone } from '../hooks/useTimeZone';
import { formatPrice, formatR, formatShortDateTime, formatSignedMoney } from '../utils/format';
import { timeZoneShort } from '../utils/timezone';

type SortKey = 'number' | 'date' | 'result' | 'pnl';
type SortDir = 'asc' | 'desc';

const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  STOP_LOSS: 'Stop loss',
  TAKE_PROFIT: 'Take profit',
  MANUAL: 'Manual',
};

const RESULT_ORDER = { WIN: 2, BREAKEVEN: 1, LOSS: 0 } as const;

function compare(a: Trade, b: Trade, key: SortKey): number {
  switch (key) {
    case 'number':
      return a.number - b.number;
    case 'date':
      return a.entryCandleTime - b.entryCandleTime || a.number - b.number;
    case 'pnl':
      return (a.pnl ?? 0) - (b.pnl ?? 0);
    case 'result': {
      const ra = a.pnl === null ? -1 : RESULT_ORDER[tradeResult(a.pnl)];
      const rb = b.pnl === null ? -1 : RESULT_ORDER[tradeResult(b.pnl)];
      return ra - rb;
    }
  }
}

interface Props {
  trades: readonly Trade[];
  instrument: InstrumentSpec;
  /** Latest revealed close, used to mark open trades */
  markPrice: number;
  /** False while reviewing past candles (market closes only happen at the live edge) */
  canClose: boolean;
  onClose: (tradeId: string) => void;
}

export function TradeHistory({ trades, instrument, markPrice, canClose, onClose }: Props) {
  const timeZone = useTimeZone();
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'number', dir: 'desc' });
  const sorted = [...trades].sort((a, b) => compare(a, b, sort.key) * (sort.dir === 'asc' ? 1 : -1));
  const price = (v: number | null) => (v === null ? '—' : formatPrice(v, instrument.pricePrecision));

  const header = (label: string, key?: SortKey, align = 'text-left') => {
    if (!key) return <th className={`px-1.5 py-1.5 font-medium ${align}`}>{label}</th>;
    const active = sort.key === key;
    return (
      <th className={`px-1.5 py-1.5 font-medium ${align}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className={`hover:text-terminal-text ${active ? 'text-accent' : ''}`}
          onClick={() => setSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }))}
        >
          {label}
          {active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
        </button>
      </th>
    );
  };

  if (trades.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-terminal-muted">
        No trades yet. Set a stop loss and take profit, then press BUY (B) or SELL (S).
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-xs" data-testid="trade-history">
      <thead className="sticky top-0 bg-terminal-panel text-terminal-muted">
        <tr>
          {header('#', 'number')}
          {header(`Date (${timeZoneShort(timeZone)})`, 'date')}
          {header('Side')}
          {header('Entry', undefined, 'text-right')}
          {header('Exit', undefined, 'text-right')}
          {header('SL', undefined, 'text-right')}
          {header('TP', undefined, 'text-right')}
          {header('P&L', 'pnl', 'text-right')}
          {header('R', undefined, 'text-right')}
          {header('Result', 'result')}
          {header('Exit reason')}
        </tr>
      </thead>
      <tbody className="font-mono">
        {sorted.map((t) => {
          const open = t.status === 'OPEN';
          // Open trades show live, unrealized P&L marked at the latest revealed close.
          const pnl = open ? calculatePnl(t.side, t.entryPrice, markPrice, t.quantity, instrument.quoteValuePerUnit) : t.pnl;
          const r = open && pnl !== null ? calculateRMultiple(pnl, t.riskAmount) : t.rMultiple;
          const result = open || t.pnl === null ? null : tradeResult(t.pnl);
          const tone = pnl === null || pnl === 0 ? 'text-terminal-muted' : pnl > 0 ? 'text-bull' : 'text-bear';
          const resultClass = open ? 'text-terminal-text' : result === 'WIN' ? 'text-bull' : result === 'LOSS' ? 'text-bear' : 'text-terminal-muted';
          return (
            <tr key={t.id} className={`border-t border-terminal-border/60 hover:bg-terminal-raised/60 ${open ? 'bg-accent/5' : ''}`} data-testid={open ? 'open-position' : undefined}>
              <td className="px-1.5 py-1.5">{t.number}</td>
              <td className="px-1.5 py-1.5 whitespace-nowrap">{formatShortDateTime(t.entryTime, timeZone)}</td>
              <td className={`px-1.5 py-1.5 font-semibold ${t.side === 'LONG' ? 'text-bull' : 'text-bear'}`}>{t.side === 'LONG' ? 'BUY' : 'SELL'}</td>
              <td className="px-1.5 py-1.5 text-right">{price(t.entryPrice)}</td>
              <td className="px-1.5 py-1.5 text-right">{price(t.exitPrice)}</td>
              <td className="px-1.5 py-1.5 text-right text-terminal-muted">{price(t.stopLoss)}</td>
              <td className="px-1.5 py-1.5 text-right text-terminal-muted">{price(t.takeProfit)}</td>
              <td className={`px-1.5 py-1.5 text-right ${tone} ${open ? 'italic' : ''}`} title={open ? 'Unrealized' : undefined}>
                {pnl === null ? '—' : formatSignedMoney(pnl)}
              </td>
              <td className={`px-1.5 py-1.5 text-right ${tone} ${open ? 'italic' : ''}`}>{r === null ? '—' : formatR(r)}</td>
              <td className={`px-1.5 py-1.5 font-sans font-semibold ${resultClass}`}>
                {open ? (
                  <span className="flex items-center gap-1.5">
                    OPEN
                    <button
                      type="button"
                      onClick={() => onClose(t.id)}
                      disabled={!canClose}
                      title={canClose ? 'Close at market' : 'Step forward to the latest candle to close'}
                      className="rounded border border-terminal-strong px-1.5 py-px text-[11px] font-normal text-terminal-text hover:border-bear hover:text-bear disabled:opacity-40"
                    >
                      Close
                    </button>
                  </span>
                ) : (
                  result
                )}
              </td>
              <td className="px-1.5 py-1.5 font-sans text-terminal-muted">
                <span className="whitespace-nowrap">{t.exitReason ? EXIT_REASON_LABELS[t.exitReason] : '—'}</span>
                {t.ambiguousExit && (
                  <span className="ml-1 text-warn" title="SL and TP were both touched in this candle; the same-candle rule decided the exit.">
                    ⚠
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
