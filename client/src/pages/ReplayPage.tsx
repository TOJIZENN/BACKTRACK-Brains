import { useCallback, useMemo, useState } from 'react';
import { BottomPanel } from '../components/BottomPanel';
import { CandleChartView } from '../components/CandleChartView';
import { JumpToDate } from '../components/JumpToDate';
import { ReplayControls } from '../components/ReplayControls';
import { ShortcutsHelp } from '../components/ShortcutsHelp';
import { TradeToasts } from '../components/TradeToasts';
import { TradingPanel } from '../components/TradingPanel';
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

type Dialog = 'help' | 'confirmReset' | 'confirmExit' | 'jump' | null;

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
    <div className="flex min-h-full flex-col lg:h-full">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-terminal-border bg-terminal-panel px-4 py-2">
        <span className="font-semibold text-gold">BACKTRACK</span>
        <span className="font-mono text-sm">
          {instrument.displayName} · {setup.granularity}
        </span>
        <span
          className="rounded border border-gold/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold"
          title="Historical replay only. No orders are sent to any broker or data provider."
        >
          Simulation
        </span>
        <span className="text-xs text-terminal-muted" title="Applied when one candle touches both SL and TP">
          Same-candle rule: <span className="text-terminal-text">{SAME_CANDLE_RULE_LABELS[setup.sameCandleRule]}</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" onClick={() => setDialog('jump')} disabled={jumping}>
            Jump to date
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

      <main className="flex min-h-0 flex-1 max-lg:flex-col">
        <section className="relative min-w-0 flex-1 max-lg:h-[60vh] max-lg:flex-none">
          <CandleChartView
            candles={snapshot.visibleCandles}
            pricePrecision={instrument.pricePrecision}
            priceLines={priceLines}
            markers={markers}
            focusKey={snapshot.runId}
          />
          <TradeToasts key={snapshot.runId} events={snapshot.events} pricePrecision={instrument.pricePrecision} />
          {jumping && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-terminal-bg/70">
              <Spinner label="Loading historical candles..." />
            </div>
          )}
        </section>
        <TradingPanel snapshot={snapshot} ticket={ticket} instrument={instrument} onClosePosition={closePosition} />
      </main>

      <ReplayControls
        snapshot={snapshot}
        onPlayPause={() => session.togglePlay()}
        onNext={() => session.next()}
        onPrevious={() => session.previous()}
        onReset={requestReset}
        onSpeedChange={(speed) => session.setSpeed(speed)}
      />
      <BottomPanel snapshot={snapshot} instrument={instrument} />

      {dialog === 'help' && <ShortcutsHelp onClose={closeDialog} />}
      {dialog === 'jump' && (
        <JumpToDate
          initialMs={setup.startMs}
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
  );
}
