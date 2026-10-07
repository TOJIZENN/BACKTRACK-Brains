import { AHEAD_MS, BASE_GRANULARITY, BASE_SECONDS, HISTORY_MS } from '../replay/dataWindow';
import { findStartIndex } from '../replay/startIndex';
import { ReplaySession, type CandleFetcher } from '../store/replaySession';
import type { TradingAccount } from '../trading/tradingAccount';
import type { SessionSetup } from '../types/session';
import { formatDateTime } from '../utils/format';
import { fetchCandles } from './candles';

/** A user-facing problem with the chosen replay period. */
export class SessionLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionLoadError';
  }
}

/** Loads 1-minute history around the chosen start and creates a replay session positioned at it. */
export async function loadReplaySession(
  setup: SessionSetup,
  fetcher: CandleFetcher = fetchCandles,
  now: () => number = Date.now,
  /** Carry an existing account (balance + history) into the new session, e.g. Jump to date. */
  account?: TradingAccount,
): Promise<ReplaySession> {
  const nowMs = now();
  if (!Number.isFinite(setup.startMs)) throw new SessionLoadError('Please choose a valid start date and time.');
  if (setup.startMs >= nowMs) throw new SessionLoadError('The start time is in the future. Choose a past date.');

  const fromMs = setup.startMs - HISTORY_MS;
  const toMs = Math.min(setup.startMs + AHEAD_MS, nowMs);
  const candles = await fetcher(setup.instrument, BASE_GRANULARITY, fromMs, toMs);
  const when = formatDateTime(setup.startMs, setup.timeZone);

  if (candles.length === 0) {
    throw new SessionLoadError(`No candles found around ${when}. The market may have been closed (weekend/holiday).`);
  }
  const startIndex = findStartIndex(candles, setup.startMs, BASE_SECONDS);
  if (startIndex < 0) {
    throw new SessionLoadError(`No completed candles before ${when}. Choose a later start time.`);
  }
  if (startIndex === candles.length - 1) {
    throw new SessionLoadError(`No candles after ${when} to replay. Choose an earlier start time.`);
  }
  return new ReplaySession(setup, candles, startIndex, toMs, fetcher, now, account);
}
