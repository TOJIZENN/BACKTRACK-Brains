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
  runStartMs: Date.parse('2026-01-15T01:00:00Z'),
  startingBalance: 10_000,
  riskPercent: 1,
  sameCandleRule: 'SL_FIRST',
  timeZone: 'UTC',
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

  it('backs off after a failed prefetch and retries when Next is pressed at the end of the data', async () => {
    let fail = true;
    const fetcher = vi.fn<CandleFetcher>(async () => {
      if (fail) throw new Error('Twelve Data rate limit reached.');
      return [makeCandle(3), makeCandle(4)];
    });
    const session = new ReplaySession(setup, makeCandles(3), 1, 0, fetcher, FAR_FUTURE);
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    session.next(); // reveals candle 2 — automatic retry is suppressed by the backoff
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().canAdvance).toBe(true);

    fail = false;
    session.next(); // end of loaded data → explicit retry
    await flush();
    // The retry succeeds; further calls are the normal end-of-data probing (empty windows).
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(session.getSnapshot().error).toBeNull();
    session.next();
    expect(session.getSnapshot().replay.currentIndex).toBe(3);
  });

  it('retryLoadMore() retries immediately', async () => {
    const fetcher = vi.fn<CandleFetcher>(async () => {
      throw new Error('offline');
    });
    const session = new ReplaySession(setup, makeCandles(3), 1, 0, fetcher, FAR_FUTURE);
    await flush();
    session.retryLoadMore();
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reports prefetch errors without crashing', async () => {
    const fetcher = vi.fn<CandleFetcher>(async () => {
      throw new Error('Twelve Data is temporarily unavailable.');
    });
    const session = new ReplaySession(setup, makeCandles(3), 1, 0, fetcher, FAR_FUTURE);
    await flush();
    expect(session.getSnapshot().error).toContain('Twelve Data is temporarily unavailable.');
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

describe('ReplaySession trading', () => {
  // Candle i has OHLC = 100 + i, so the close at index 2 is 102.
  function session(candles = makeCandles(300)) {
    return new ReplaySession(setup, candles, 2, 0, vi.fn<CandleFetcher>(async () => []), FAR_FUTURE);
  }
  const order = { side: 'LONG' as const, stopLoss: 97, takeProfit: 112, riskPercent: 1 };

  it('fills market orders at the current candle close, timestamped at its close time', () => {
    const s = session();
    const result = s.placeOrder(order);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trade.entryPrice).toBe(102);
    expect(result.trade.entryTime).toBe('2026-01-15T00:15:00Z');
    expect(s.getSnapshot().trades).toHaveLength(1);
    expect(s.getSnapshot().events.at(-1)?.kind).toBe('opened');
  });

  it('resolves trades as new candles are revealed and updates balance', () => {
    const s = session();
    s.placeOrder(order); // 20 oz, risk $100, TP at 112 (+$200)
    for (let i = 0; i < 9; i++) s.next(); // candle 11: high 111 → still open
    expect(s.getSnapshot().stats.openTrades).toBe(1);
    s.next(); // candle 12 high 112 → TP
    const snap = s.getSnapshot();
    expect(snap.trades[0]).toMatchObject({ status: 'CLOSED', exitReason: 'TAKE_PROFIT', pnl: 200, rMultiple: 2 });
    expect(snap.stats.balance).toBe(10_200);
    expect(snap.events.at(-1)?.kind).toBe('closed');
  });

  it('refuses orders while reviewing past candles', () => {
    const s = session();
    s.next();
    s.previous();
    const result = s.placeOrder(order);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('reviewing past candles') });
  });

  it('reports invalid SL/TP', () => {
    const result = session().placeOrder({ ...order, stopLoss: 103 });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('stop loss must be below') });
  });

  it('does not re-resolve trades when stepping back and forward', () => {
    const candles = makeCandles(300);
    candles[4] = { ...candles[4], low: 90 }; // wick through the stop on candle 4
    const s = session(candles);
    s.next(); // candle 3
    s.placeOrder(order); // entry 103, SL 97
    s.previous(); // back to 2
    s.next(); // candle 3 again — not new, and before entry anyway
    expect(s.getSnapshot().stats.openTrades).toBe(1);
    s.next(); // candle 4 is new → SL
    expect(s.getSnapshot().trades[0].exitReason).toBe('STOP_LOSS');
    expect(s.getSnapshot().stats.totalTrades).toBe(1);
  });

  it('reset clears trades and restores the starting balance', () => {
    const s = session();
    s.placeOrder(order);
    for (let i = 0; i < 10; i++) s.next();
    s.reset();
    const snap = s.getSnapshot();
    expect(snap.trades).toEqual([]);
    expect(snap.stats.balance).toBe(10_000);
    expect(snap.replay.currentIndex).toBe(2);
  });

  it('manual close at the current close', () => {
    const s = session();
    const opened = s.placeOrder(order);
    s.next();
    s.next();
    if (!opened.ok) throw new Error('order failed');
    const closed = s.closeTrade(opened.trade.id);
    expect(closed.ok && closed.trade).toMatchObject({ exitReason: 'MANUAL', exitPrice: 104, pnl: 40 });
  });
});

describe('ReplaySession.alignClockTo (timeframe switch)', () => {
  // M5 candles from 00:00; candle i closes at (i+1)*5 min.
  const H1 = 3600;

  it('advances to the next bar boundary of the new timeframe, resolving trades on the way', async () => {
    const candles = makeCandles(40);
    candles[9] = { ...candles[9], low: 50 }; // wick through the stop at 00:45
    const s = new ReplaySession(setup, candles, 6, 0, vi.fn<CandleFetcher>(async () => []), FAR_FUTURE); // clock 00:35
    s.placeOrder({ side: 'LONG', stopLoss: 97, takeProfit: 200, riskPercent: 1 });
    const { clockMs, advancedBars } = await s.alignClockTo(H1);
    expect(new Date(clockMs).toISOString()).toBe('2026-01-15T01:00:00.000Z');
    expect(advancedBars).toBe(5);
    expect(s.getSnapshot().trades[0].exitReason).toBe('STOP_LOSS');
  });

  it('does nothing when already on a boundary', async () => {
    const s = new ReplaySession(setup, makeCandles(40), 11, 0, vi.fn<CandleFetcher>(async () => []), FAR_FUTURE); // clock 01:00
    expect(await s.alignClockTo(H1)).toEqual({ clockMs: Date.parse('2026-01-15T01:00:00Z'), advancedBars: 0 });
  });

  it('stops at a gap instead of jumping over it (e.g. weekend close)', async () => {
    const candles = makeCandles(8); // 00:00 .. 00:35
    const afterGap = { ...makeCandle(8), time: makeCandle(8).time + 10 * H1 };
    const s = new ReplaySession(setup, [...candles, afterGap], 5, 0, vi.fn<CandleFetcher>(async () => []), FAR_FUTURE);
    const { clockMs } = await s.alignClockTo(H1);
    expect(new Date(clockMs).toISOString()).toBe('2026-01-15T00:40:00.000Z'); // last candle before the gap
  });

  it('returns to the live edge first and never re-resolves reviewed candles', async () => {
    const s = new ReplaySession(setup, makeCandles(40), 6, 0, vi.fn<CandleFetcher>(async () => []), FAR_FUTURE);
    s.next();
    s.previous();
    s.previous();
    await s.alignClockTo(900); // M15
    expect(s.getSnapshot().replay.atLiveEdge).toBe(true);
    expect(new Date(s.clockMs()).toISOString()).toBe('2026-01-15T00:45:00.000Z');
  });
});
