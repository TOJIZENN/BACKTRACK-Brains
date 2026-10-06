import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCandle, makeCandles } from '../test/fixtures';
import type { SessionSetup } from '../types/session';
import { ReplaySession, type CandleFetcher } from './replaySession';
import { loadReplaySession, SessionLoadError } from '../services/sessionLoader';
import { PREFETCH_THRESHOLD_CANDLES } from '../replay/dataWindow';

const setup: SessionSetup = {
  instrument: 'XAU_USD',
  granularity: 'M5',
  startMs: Date.parse('2026-01-15T01:00:00Z'),
  startingBalance: 10_000,
  riskPercent: 1,
  sameCandleRule: 'SL_FIRST',
};
const FAR_FUTURE = () => Date.parse('2027-01-01T00:00:00Z');
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('ReplaySession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('publishes a new snapshot only when something changes', () => {
    const fetcher = vi.fn<CandleFetcher>(async () => []);
    const session = new ReplaySession(setup, makeCandles(500), 10, 0, fetcher, FAR_FUTURE);
    const first = session.getSnapshot();
    expect(session.getSnapshot()).toBe(first);
    session.next();
    expect(session.getSnapshot()).not.toBe(first);
    expect(session.getSnapshot().visibleCandles).toHaveLength(12);
  });

  it('prefetches forward data when the buffer runs low', async () => {
    const more = [makeCandle(5), makeCandle(6)];
    const fetcher = vi.fn<CandleFetcher>(async () => more);
    const session = new ReplaySession(setup, makeCandles(5), 1, Date.parse('2026-01-15T00:25:00Z'), fetcher, FAR_FUTURE);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await flush();
    for (let i = 0; i < 5; i++) session.next();
    expect(session.getSnapshot().replay.currentIndex).toBe(6);
    // Visible data never includes anything past the current candle.
    expect(session.getSnapshot().visibleCandles.at(-1)).toEqual(makeCandle(6));
  });

  it('does not prefetch while the buffer is healthy', () => {
    const fetcher = vi.fn<CandleFetcher>(async () => []);
    new ReplaySession(setup, makeCandles(PREFETCH_THRESHOLD_CANDLES + 20), 0, 0, fetcher, FAR_FUTURE);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps playing through a prefetch and stops at the true end of data', async () => {
    let calls = 0;
    const fetcher = vi.fn<CandleFetcher>(async () => (++calls === 1 ? [makeCandle(3)] : []));
    const session = new ReplaySession(setup, makeCandles(3), 1, 0, fetcher, FAR_FUTURE);
    session.play();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(session.getSnapshot().replay.currentIndex).toBe(3);
    expect(session.getSnapshot().replay.status).toBe('paused');
    expect(session.getSnapshot().dataExhausted).toBe(true);
  });

  it('reports prefetch errors without crashing', async () => {
    const fetcher = vi.fn<CandleFetcher>(async () => {
      throw new Error('OANDA is temporarily unavailable.');
    });
    const session = new ReplaySession(setup, makeCandles(3), 1, 0, fetcher, FAR_FUTURE);
    await flush();
    expect(session.getSnapshot().error).toContain('OANDA is temporarily unavailable.');
  });
});

describe('loadReplaySession', () => {
  const candles = makeCandles(48); // 00:00 .. 03:55 UTC on 2026-01-15

  it('positions the replay at the last candle closed before the start time', async () => {
    const session = await loadReplaySession(setup, async () => candles, FAR_FUTURE);
    const snap = session.getSnapshot();
    expect(snap.currentCandle.timestamp).toBe('2026-01-15T00:55:00Z');
    expect(snap.visibleCandles).toHaveLength(12);
    session.dispose();
  });

  it.each([
    [[], 'No M5 candles found'],
    [makeCandles(48).slice(13), 'No completed candles before'],
    [makeCandles(12), 'No candles after'],
  ])('explains unusable periods %#', async (data, message) => {
    await expect(loadReplaySession(setup, async () => data, FAR_FUTURE)).rejects.toThrow(message);
  });

  it('rejects start times in the future', async () => {
    await expect(loadReplaySession(setup, async () => candles, () => setup.startMs - 1)).rejects.toBeInstanceOf(
      SessionLoadError,
    );
  });
});
