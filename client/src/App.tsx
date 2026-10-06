import { useEffect, useRef, useState } from 'react';
import { ReplayPage } from './pages/ReplayPage';
import { SetupPage } from './pages/SetupPage';
import { loadReplaySession } from './services/sessionLoader';
import type { ReplaySession } from './store/replaySession';
import type { SessionSetup } from './types/session';

export default function App() {
  const [session, setSession] = useState<ReplaySession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => () => session?.dispose(), [session]);

  const start = async (setup: SessionSetup) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loadReplaySession(setup);
      if (id !== requestId.current) return next.dispose();
      setSession(next);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  if (session) return <ReplayPage key={session.setup.startMs} session={session} onExit={() => setSession(null)} />;
  return <SetupPage onStart={start} loading={loading} error={error} onDismissError={() => setError(null)} />;
}
