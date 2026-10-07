import { useCallback, useMemo, useRef, useState } from 'react';
import type { CandleChart } from '../chart/candleChart';
import type { Drawing, DrawingTool } from '../chart/drawings/types';
import { ChartSettingsDialog } from '../components/ChartSettingsDialog';
import { DrawingStyleBar } from '../components/DrawingStyleBar';
import { DrawingToolbar } from '../components/DrawingToolbar';
import { useChartSettings } from '../hooks/useChartSettings';
import { usePanelLayout } from '../hooks/usePanelLayout';
import { GRANULARITY_SECONDS } from '../types/market';
import { BottomPanel } from '../components/BottomPanel';
import { CandleChartView } from '../components/CandleChartView';
import { JumpToDate } from '../components/JumpToDate';
import { ReplayControls } from '../components/ReplayControls';
import { ShortcutsHelp } from '../components/ShortcutsHelp';
import { TradeToasts } from '../components/TradeToasts';
import { OrderWidget } from '../components/OrderWidget';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Icon } from '../components/ui/Icon';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { draftLines, openTradeLines, tradeMarkers } from '../chart/tradeOverlays';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useOrderTicket } from '../hooks/useOrderTicket';
import { useReplaySnapshot } from '../hooks/useReplaySession';
import type { ReplaySession } from '../store/replaySession';
import { SAME_CANDLE_RULE_LABELS } from '../trading/types';
import { INSTRUMENTS } from '../types/market';
import { TimeZoneContext } from '../hooks/useTimeZone';
import { TIME_ZONES } from '../utils/timezone';

type Dialog = 'help' | 'confirmReset' | 'confirmExit' | 'jump' | 'settings' | null;

interface Props {
  session: ReplaySession;
  onExit: () => void;
  onJump: (startMs: number) => void;
  jumping: boolean;
  jumpError: string | null;
  onDismissJumpError: () => void;
}

export function ReplayPage({ session, onExit, onJump, jumping, jumpError, onDismissJumpError }: Props) {
  const snapshot = useReplaySnapshot(session);
  const ticket = useOrderTicket(session);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [chartSettings, setChartSettings] = useChartSettings();
  const panel = usePanelLayout();
  const chartRef = useRef<CandleChart | null>(null);
  // Drawings live with this session (a new session or jump starts clean, so no lines drawn
  // with knowledge of a later period leak into an earlier replay). Reset keeps them.
  const [tool, setTool] = useState<DrawingTool>('cursor');
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId) ?? null;
  const { setup } = session;
  const instrument = INSTRUMENTS[setup.instrument];

  const { trades, currentCandle } = snapshot;
  const hasTrades = trades.length > 0;
  const hasOpenTrades = snapshot.stats.openTrades > 0;

  const priceLines = useMemo(
    () => [...openTradeLines(trades), ...draftLines(ticket.order.stopLoss, ticket.order.takeProfit)],
    [trades, ticket.order.stopLoss, ticket.order.takeProfit],
  );
  const markers = useMemo(() => tradeMarkers(trades, currentCandle.time), [trades, currentCandle.time]);

  const closeDialog = useCallback(() => setDialog(null), []);

  const requestReset = () => {
    if (hasTrades) {
      session.pause();
      setDialog('confirmReset');
    } else {
      session.reset();
    }
  };

  const requestExit = () => {
    if (hasTrades) {
      session.pause();
      setDialog('confirmExit');
    } else {
      onExit();
    }
  };

  const closePosition = (tradeId: string) => {
    const result = session.closeTrade(tradeId);
    if (!result.ok) ticket.setError(result.error);
  };

  useKeyboardShortcuts(
    {
      playPause: () => session.togglePlay(),
      next: () => session.next(),
      previous: () => session.previous(),
      reset: requestReset,
      buy: () => ticket.submit('LONG'),
      sell: () => ticket.submit('SHORT'),
      escape: () => ticket.setError(null),
    },
    dialog === null && !jumping,
  );

  return (
    <TimeZoneContext.Provider value={setup.timeZone}>
    <div className="flex min-h-full flex-col lg:h-full">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-terminal-border bg-terminal-panel px-4 py-2">
        <span className="font-bold tracking-wide text-terminal-text">BACK<span className="text-accent">TRACK</span></span>
        <span className="font-mono text-sm">
          {instrument.displayName} · {setup.granularity}
        </span>
        <span
          className="rounded border border-warn/50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-warn"
          title="Historical replay only. No orders are sent to any broker or data provider."
        >
          Simulation
        </span>
        <span className="text-xs text-terminal-muted" title="Applied when one candle touches both SL and TP">
          Same-candle rule: <span className="text-terminal-text">{SAME_CANDLE_RULE_LABELS[setup.sameCandleRule]}</span>
        </span>
        <span className="text-xs text-terminal-muted" title="All times are shown in this time zone">
          Time zone: <span className="text-terminal-text">{TIME_ZONES.find((z) => z.id === setup.timeZone)?.label ?? setup.timeZone}</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" onClick={() => setDialog('jump')} disabled={jumping}>
            Jump to date
          </Button>
          <Button variant="ghost" onClick={() => setDialog('settings')} title="Chart settings" aria-label="Chart settings">
            <Icon name="settings" />
          </Button>
          <Button variant="ghost" onClick={() => setDialog('help')} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">
            <Icon name="keyboard" />
          </Button>
          <Button variant="ghost" onClick={requestExit}>
            New session
          </Button>
        </div>
      </header>

      {(snapshot.error || jumpError) && (
        <div className="flex flex-col gap-2 px-4 pt-2">
          {snapshot.error && (
            <ErrorBanner
              message={snapshot.error}
              action={snapshot.loadingMore ? undefined : { label: 'Retry', onClick: () => session.retryLoadMore() }}
            />
          )}
          {jumpError && <ErrorBanner title="Could not jump" message={jumpError} onDismiss={onDismissJumpError} />}
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1">
        <DrawingToolbar tool={tool} onToolChange={setTool} onClearAll={() => chartRef.current?.clearDrawings()} hasDrawings={drawings.length > 0} />
        <section className="relative min-w-0 flex-1">
          <CandleChartView
            candles={snapshot.visibleCandles}
            pricePrecision={instrument.pricePrecision}
            timeZone={setup.timeZone}
            barSeconds={GRANULARITY_SECONDS[setup.granularity]}
            settings={chartSettings}
            priceLines={priceLines}
            markers={markers}
            focusKey={snapshot.runId}
            tool={tool}
            drawings={drawings}
            onToolChange={setTool}
            onDrawingsChange={setDrawings}
            onSelectionChange={setSelectedDrawingId}
            chartRef={chartRef}
          />
          {selectedDrawing && (
            <DrawingStyleBar
              drawing={selectedDrawing}
              onStyle={(style) => chartRef.current?.setDrawingStyle(style)}
              onDelete={() => chartRef.current?.deleteSelectedDrawing()}
            />
          )}
          <OrderWidget snapshot={snapshot} ticket={ticket} instrument={instrument} />
          <TradeToasts key={snapshot.runId} events={snapshot.events} pricePrecision={instrument.pricePrecision} />
          {jumping && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-terminal-bg/70">
              <Spinner label="Loading historical candles..." />
            </div>
          )}
        </section>
        </div>
      </main>

      <ReplayControls
        snapshot={snapshot}
        onPlayPause={() => session.togglePlay()}
        onNext={() => session.next()}
        onPrevious={() => session.previous()}
        onReset={requestReset}
        onSpeedChange={(speed) => session.setSpeed(speed)}
      />
      <BottomPanel
        snapshot={snapshot}
        instrument={instrument}
        height={panel.layout.bottomHeight}
        collapsed={panel.layout.bottomCollapsed}
        onResize={panel.setBottomHeight}
        onToggleCollapsed={panel.toggleBottomCollapsed}
        onClosePosition={closePosition}
      />

      {dialog === 'help' && <ShortcutsHelp onClose={closeDialog} />}
      {dialog === 'settings' && <ChartSettingsDialog settings={chartSettings} onChange={setChartSettings} onClose={closeDialog} />}
      {dialog === 'jump' && (
        <JumpToDate
          initialMs={setup.startMs}
          timeZone={setup.timeZone}
          hasOpenTrades={hasOpenTrades}
          onClose={closeDialog}
          onJump={(ms) => {
            setDialog(null);
            onJump(ms);
          }}
        />
      )}
      {dialog === 'confirmReset' && (
        <Modal
          title="Reset replay?"
          onClose={closeDialog}
          footer={
            <>
              <Button variant="ghost" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  session.reset();
                  setDialog(null);
                }}
              >
                Reset
              </Button>
            </>
          }
        >
          Returns to the starting candle and clears this run&apos;s {trades.length} trade(s). The balance goes back to the
          starting balance.
        </Modal>
      )}
      {dialog === 'confirmExit' && (
        <Modal
          title="Start a new session?"
          onClose={closeDialog}
          footer={
            <>
              <Button variant="ghost" onClick={closeDialog}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onExit}>
                Discard &amp; continue
              </Button>
            </>
          }
        >
          Trades and statistics from this session are not saved and will be discarded.
        </Modal>
      )}
    </div>
    </TimeZoneContext.Provider>
  );
}
