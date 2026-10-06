import { CandleChartView } from '../components/CandleChartView';
import { ReplayControls } from '../components/ReplayControls';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Button } from '../components/ui/Button';
import { useReplaySnapshot } from '../hooks/useReplaySession';
import type { ReplaySession } from '../store/replaySession';
import { SAME_CANDLE_RULE_LABELS } from '../trading/types';
import { INSTRUMENTS } from '../types/market';

interface Props {
  session: ReplaySession;
  onExit: () => void;
}

export function ReplayPage({ session, onExit }: Props) {
  const snapshot = useReplaySnapshot(session);
  const { setup } = session;
  const instrument = INSTRUMENTS[setup.instrument];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-terminal-border bg-terminal-panel px-4 py-2">
        <span className="font-semibold text-gold">BACKTRACK</span>
        <span className="font-mono text-sm">
          {instrument.displayName} · {setup.granularity}
        </span>
        <span className="rounded border border-gold/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold">
          Simulation
        </span>
        <span className="text-xs text-terminal-muted" title="Applied when one candle touches both SL and TP">
          Same-candle rule: {SAME_CANDLE_RULE_LABELS[setup.sameCandleRule]}
        </span>
        <div className="ml-auto">
          <Button variant="ghost" onClick={onExit}>
            New session
          </Button>
        </div>
      </header>

      {snapshot.error && (
        <div className="px-4 pt-2">
          <ErrorBanner message={snapshot.error} />
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        <section className="relative min-w-0 flex-1">
          <CandleChartView
            candles={snapshot.visibleCandles}
            pricePrecision={instrument.pricePrecision}
            focusKey={snapshot.runId}
          />
        </section>
      </main>

      <ReplayControls
        snapshot={snapshot}
        onPlayPause={() => session.togglePlay()}
        onNext={() => session.next()}
        onPrevious={() => session.previous()}
        onReset={() => session.reset()}
        onSpeedChange={(speed) => session.setSpeed(speed)}
      />
    </div>
  );
}
