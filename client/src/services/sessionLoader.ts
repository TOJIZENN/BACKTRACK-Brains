import { DATA_WINDOWS } from '../replay/dataWindow';
import { findStartIndex } from '../replay/startIndex';
import { ReplaySession, type CandleFetcher } from '../store/replaySession';
import { GRANULARITY_SECONDS } from '../types/market';
import type { SessionSetup } from '../types/session';
import { formatDateTimeUtc } from '../utils/format';
import { fetchCandles } from './candles';

/** A user-facing problem with the chosen replay period. */
export class SessionLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionLoadError';
  }
}

/** Loads history around the chosen start and creates a replay session positioned at it. */
export async function loadReplaySession(
  setup: SessionSetup,
  fetcher: CandleFetcher = fetchCandles,
  now: () => number = Date.now,
): Promise<ReplaySession> {
  const nowMs = now();
  if (!Number.isFinite(setup.startMs)) throw new SessionLoadError('Please choose a valid start date and time.');
  if (setup.startMs >= nowMs) throw new SessionLoadError('The start time is in the future. Choose a past date.');

  const window = DATA_WINDOWS[setup.granularity];
  const fromMs = setup.startMs - window.historyMs;
  const toMs = Math.min(setup.startMs + window.aheadMs, nowMs);
  const candles = await fetcher(setup.instrument, setup.granularity, fromMs, toMs);
  const when = formatDateTimeUtc(setup.startMs);

  if (candles.length === 0) {
    throw new SessionLoadError(`No ${setup.granularity} candles found around ${when}. The market may have been closed (weekend/holiday).`);
  }
  const startIndex = findStartIndex(candles, setup.startMs, GRANULARITY_SECONDS[setup.granularity]);
  if (startIndex < 0) {
    throw new SessionLoadError(`No completed candles before ${when}. Choose a later start time.`);
  }
  if (startIndex === candles.length - 1) {
    throw new SessionLoadError(`No candles after ${when} to replay. Choose an earlier start time.`);
  }
  return new ReplaySession(setup, candles, startIndex, toMs, fetcher, now);
}
