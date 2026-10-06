import { useEffect, useRef, useState } from 'react';
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
  const requestId = useRef(0);

  useEffect(() => () => session?.dispose(), [session]);

  /** Loads a session; on failure the current screen stays as it is and shows the error. */
  const load = async (setup: SessionSetup, carryAccount: boolean) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      session?.pause();
      const next = await loadReplaySession(setup, undefined, undefined, carryAccount ? session?.account : undefined);
      if (id !== requestId.current) return next.dispose();
      setSession(next);
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err));
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
    return (
      <ReplayPage
        key={`${session.setup.startMs}-${session.setup.granularity}`}
        session={session}
        onExit={exit}
        onJump={(startMs) => load({ ...session.setup, startMs }, true)}
        jumping={loading}
        jumpError={error}
        onDismissJumpError={() => setError(null)}
      />
    );
  }
  return <SetupPage onStart={(setup) => load(setup, false)} loading={loading} error={error} onDismissError={() => setError(null)} />;
}
