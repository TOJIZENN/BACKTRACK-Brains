import { useEffect, useRef, useState } from 'react';
import type { Drawing } from './chart/drawings/types';
import { ReplayPage } from './pages/ReplayPage';
import { SetupPage } from './pages/SetupPage';
import { loadReplaySession } from './services/sessionLoader';
import type { ReplaySession } from './store/replaySession';
import { GRANULARITY_SECONDS, type Granularity } from './types/market';
import type { SessionSetup } from './types/session';
import { formatDateTime } from './utils/format';

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function App() {
  const [session, setSession] = useState<ReplaySession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Drawings belong to the run: kept across timeframe switches and Reset, cleared on new session/jump.
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const requestId = useRef(0);

  useEffect(() => () => session?.dispose(), [session]);

  /** Loads a session; on failure the current screen stays as it is and shows the error. */
  const load = async (
    setup: SessionSetup,
    { carryAccount = false, keepDrawings = false }: { carryAccount?: boolean; keepDrawings?: boolean } = {},
  ): Promise<ReplaySession | null> => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      session?.pause();
      const next = await loadReplaySession(setup, undefined, undefined, carryAccount ? session?.account : undefined);
      if (id !== requestId.current) {
        next.dispose();
        return null;
      }
      if (!keepDrawings) setDrawings([]);
      setSession(next);
      return next;
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err));
      return null;
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  /**
   * TradingView-style timeframe change mid-replay. The clock is first moved to the next bar boundary of
   * the new timeframe (revealing and resolving lower-timeframe candles as usual), so the new chart never
   * shows a partly-future bar. Account, open positions, drawings and speed carry over.
   */
  const switchTimeframe = async (granularity: Granularity) => {
    if (!session || loading || granularity === session.setup.granularity) return;
    const previous = session;
    setNotice(null);
    setLoading(true);
    const { clockMs, advancedBars } = await previous.alignClockTo(GRANULARITY_SECONDS[granularity]);
    const speed = previous.getSnapshot().replay.speed;
    const next = await load({ ...previous.setup, granularity, startMs: clockMs }, { carryAccount: true, keepDrawings: true });
    if (!next) return;
    next.setSpeed(speed);
    if (advancedBars > 0) {
      setNotice(
        `Replay advanced ${advancedBars} ${previous.setup.granularity} bar${advancedBars === 1 ? '' : 's'} to ` +
          `${formatDateTime(clockMs, previous.setup.timeZone)} to complete the current ${granularity} bar.`,
      );
    }
  };

  const exit = () => {
    requestId.current++;
    setLoading(false);
    setError(null);
    setNotice(null);
    setSession(null);
  };

  if (session) {
    const { setup } = session;
    return (
      <ReplayPage
        key={`${setup.startMs}-${setup.granularity}`}
        session={session}
        drawings={drawings}
        onDrawingsChange={setDrawings}
        onExit={exit}
        onJump={(startMs) => {
          setNotice(null);
          void load({ ...setup, startMs, runStartMs: startMs }, { carryAccount: true });
        }}
        onSwitchTimeframe={(g) => void switchTimeframe(g)}
        // Reset after a timeframe switch reloads the original start of the run on the current timeframe.
        onRestart={() => {
          setNotice(null);
          void load({ ...setup, startMs: setup.runStartMs }, { keepDrawings: true });
        }}
        loading={loading}
        loadError={error}
        onDismissLoadError={() => setError(null)}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
      />
    );
  }
  return (
    <SetupPage
      onStart={(s) => void load(s)}
      loading={loading}
      error={error}
      onDismissError={() => setError(null)}
    />
  );
}
