import { useState } from 'react';
import type { ReplaySnapshot } from '../store/replaySession';
import type { InstrumentSpec } from '../types/market';
import { AccountStats } from './AccountStats';
import { EquityCurve } from './EquityCurve';
import { TradeHistory } from './TradeHistory';
import { Icon } from './ui/Icon';
import { formatMoney, formatSignedMoney } from '../utils/format';

interface Props {
  snapshot: ReplaySnapshot;
  instrument: InstrumentSpec;
}

/** Collapsible dashboard: account stats, trade history and equity curve. */
export function BottomPanel({ snapshot, instrument }: Props) {
  const [open, setOpen] = useState(true);
  const { stats, trades } = snapshot;

  return (
    <section className="border-t border-terminal-border bg-terminal-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-1.5 text-left text-xs hover:bg-terminal-raised/50"
      >
        <span className="font-semibold uppercase tracking-wider text-terminal-muted">Trades &amp; performance</span>
        <span className="text-terminal-muted">
          Balance <span className="font-mono text-terminal-text">{formatMoney(stats.balance)}</span>
        </span>
        <span className="text-terminal-muted">
          P&amp;L{' '}
          <span className={`font-mono ${stats.totalPnl > 0 ? 'text-bull' : stats.totalPnl < 0 ? 'text-bear' : 'text-terminal-text'}`}>
            {formatSignedMoney(stats.totalPnl)}
          </span>
        </span>
        <span className="text-terminal-muted">
          Trades <span className="font-mono text-terminal-text">{stats.totalTrades}</span>
        </span>
        <span className="ml-auto text-terminal-muted">
          <Icon name={open ? 'chevronDown' : 'chevronUp'} />
        </span>
      </button>
      {open && (
        <div className="grid h-72 grid-cols-[minmax(240px,270px)_1fr_minmax(260px,340px)] gap-4 border-t border-terminal-border px-4 py-3 max-lg:h-auto max-lg:grid-cols-1">
          <div className="overflow-y-auto">
            <AccountStats stats={stats} />
          </div>
          <div className="min-w-0 overflow-auto max-lg:max-h-64">
            <TradeHistory trades={trades} instrument={instrument} />
          </div>
          <div className="flex min-h-0 flex-col max-lg:h-56">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-terminal-muted">Equity curve</h3>
            <div className="min-h-0 flex-1">
              <EquityCurve points={stats.equityCurve} startingBalance={stats.startingBalance} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
