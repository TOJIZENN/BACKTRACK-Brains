import { useEffect, useRef, useState } from 'react';
import type { Drawing } from './chart/drawings/types';
import { ReplayPage } from './pages/ReplayPage';
import { SetupPage } from './pages/SetupPage';
import { loadReplaySession } from './services/sessionLoader';
import type { ReplaySession } from './store/replaySession';
import type { SessionSetup } from './types/session';

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function App() {
  const [session, setSession] = useState<ReplaySession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const exit = () => {
    requestId.current++;
    setLoading(false);
    setError(null);
    setSession(null);
  };

  if (session) {
    const { setup } = session;
    return (
      <ReplayPage
        key={setup.startMs}
        session={session}
        drawings={drawings}
        onDrawingsChange={setDrawings}
        onExit={exit}
        // Jump keeps the chart timeframe you are on.
        onJump={(startMs) => void load({ ...setup, startMs, granularity: session.timeframe }, { carryAccount: true })}
        loading={loading}
        loadError={error}
        onDismissLoadError={() => setError(null)}
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
