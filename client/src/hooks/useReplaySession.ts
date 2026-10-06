import { useSyncExternalStore } from 'react';
import type { ReplaySession } from '../store/replaySession';

export function useReplaySnapshot(session: ReplaySession) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
