import type { KeyboardEvent } from 'react';
import { useDragResize } from '../hooks/useDragResize';
import type { ReplaySnapshot } from '../store/replaySession';
import type { InstrumentSpec } from '../types/market';
import { formatMoney, formatSignedMoney } from '../utils/format';
import { BOTTOM_MAX_HEIGHT } from '../utils/panelLayout';
import { AccountStats } from './AccountStats';
import { EquityCurve } from './EquityCurve';
import { TradeHistory } from './TradeHistory';

const KEYBOARD_STEP = 16;

interface Props {
  snapshot: ReplaySnapshot;
  instrument: InstrumentSpec;
  /** Content height in px (below the header strip) */
  height: number;
  collapsed: boolean;
  /** Called with the dragged content height; values near 0 collapse the panel. */
  onResize: (height: number) => void;
  onToggleCollapsed: () => void;
}

/**
 * Dashboard under the chart: account stats, trade history and equity curve.
 * Its header strip is the resize handle — drag it up/down (all the way down collapses it), like
 * TradingView's bottom panel. Double-click the strip to collapse/restore.
 */
export function BottomPanel({ snapshot, instrument, height, collapsed, onResize, onToggleCollapsed }: Props) {
  const { stats, trades } = snapshot;
  const visibleHeight = collapsed ? 0 : height;
  // Dragging up by d grows the content by d: new height = (height at grab + grab y) − pointer y.
  const drag = useDragResize('vertical', (_handle, y) => visibleHeight + y, onResize);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') onResize(visibleHeight + KEYBOARD_STEP);
    else if (e.key === 'ArrowDown') onResize(visibleHeight - KEYBOARD_STEP);
    else if (e.key === 'Enter') onToggleCollapsed();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <section className="border-t border-terminal-border bg-terminal-panel" data-testid="bottom-panel">
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize trades and performance panel"
        aria-valuenow={visibleHeight}
        aria-valuemin={0}
        aria-valuemax={BOTTOM_MAX_HEIGHT}
        tabIndex={0}
        title="Drag to resize · drag down to hide · double-click to collapse/restore"
        {...drag}
        onDoubleClick={onToggleCollapsed}
        onKeyDown={onKeyDown}
        className="group relative flex cursor-row-resize select-none items-center gap-4 px-4 py-1.5 text-xs outline-none hover:bg-terminal-raised/50 focus-visible:bg-terminal-raised/50"
        data-testid="bottom-resizer"
      >
        <span className="absolute inset-x-0 top-0 h-px bg-transparent transition group-hover:h-0.5 group-hover:bg-accent group-focus-visible:h-0.5 group-focus-visible:bg-accent" />
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
        {/* Grip: signals the strip can be dragged */}
        <span className="ml-auto flex flex-col gap-0.5 opacity-60 group-hover:opacity-100" aria-hidden="true">
          <span className="block h-px w-5 bg-terminal-muted" />
          <span className="block h-px w-5 bg-terminal-muted" />
        </span>
      </div>
      {!collapsed && (
        <div
          className="grid grid-cols-[minmax(240px,270px)_1fr_minmax(260px,340px)] gap-4 border-t border-terminal-border px-4 py-3"
          style={{ height }}
        >
          <div className="overflow-y-auto">
            <AccountStats stats={stats} />
          </div>
          <div className="min-w-0 overflow-auto">
            <TradeHistory trades={trades} instrument={instrument} />
          </div>
          <div className="flex min-h-0 flex-col">
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
