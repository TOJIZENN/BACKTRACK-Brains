import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCandle, makeCandles } from '../test/fixtures';
import type { SessionSetup } from '../types/session';
import { ReplaySession, type CandleFetcher } from './replaySession';
import { loadReplaySession, SessionLoadError } from '../services/sessionLoader';
import { prefetchThreshold } from '../replay/dataWindow';

const setup: SessionSetup = {
  instrument: 'XAU_USD',
  provider: 'dukascopy',
  granularity: 'M5',
  startMs: Date.parse('2026-01-15T01:00:00Z'),
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
    new ReplaySession(setup, makeCandles(prefetchThreshold(300) + 20), 0, 0, fetcher, FAR_FUTURE);
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
    [[], 'No candles found'],
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

  it('fills market orders at the current close', () => {
    const s = session();
    const result = s.placeOrder(order);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trade.entryPrice).toBe(102);
    // Fill time = close of the latest revealed minute (covered in detail by the 1-minute tests below).
    expect(result.trade.entryTime).toBe('2026-01-15T00:11:00Z');
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

// ---- 1-minute base with an aggregated chart timeframe ----

const T0 = Date.parse('2026-01-15T00:00:00Z') / 1000;
/** Minute candles from 00:00 UTC with OHLC = 100 + i (overrides by index). */
function minutes(n: number, over: Record<number, Partial<{ open: number; high: number; low: number; close: number }>> = {}) {
  return Array.from({ length: n }, (_, i) => {
    const time = T0 + i * 60;
    const p = 100 + i;
    return { time, timestamp: new Date(time * 1000).toISOString().replace('.000Z', 'Z'), open: p, high: p, low: p, close: p, volume: 1, ...over[i] };
  });
}
const m1Session = (candles: ReturnType<typeof minutes>, startIndex: number, granularity: SessionSetup['granularity']) =>
  new ReplaySession({ ...setup, granularity }, candles, startIndex, 0, vi.fn<CandleFetcher>(async () => []), FAR_FUTURE);
const hhmm = (sec: number) => new Date(sec * 1000).toISOString().slice(11, 16);

describe('ReplaySession on 1-minute data with a chart timeframe', () => {
  it('aggregates revealed minutes into chart bars, with the last bar forming', () => {
    const s = m1Session(minutes(200), 36, 'M15'); // last revealed minute 00:36 → clock 00:37
    const bars = s.getSnapshot().visibleCandles;
    expect(bars.map((b) => hhmm(b.time))).toEqual(['00:00', '00:15', '00:30']);
    expect(bars[2]).toMatchObject({ open: 130, high: 136, low: 130, close: 136 }); // 00:30–00:36 only
    expect(new Date(s.getSnapshot().clockMs).toISOString().slice(11, 16)).toBe('00:37');
  });

  it('Next completes the forming bar, then reveals one full bar per step', () => {
    const s = m1Session(minutes(200), 36, 'M15');
    s.next();
    let bars = s.getSnapshot().visibleCandles;
    expect(bars).toHaveLength(3);
    expect(bars[2]).toMatchObject({ close: 144 }); // completed through 00:44
    s.next();
    bars = s.getSnapshot().visibleCandles;
    expect(bars.map((b) => hhmm(b.time)).at(-1)).toBe('00:45');
    expect(bars.at(-1)).toMatchObject({ open: 145, close: 159 });
    expect(s.getSnapshot().replay.currentIndex).toBe(59);
  });

  it('switching timeframe is instant, reveals nothing, and shows the higher bar as forming', () => {
    const s = m1Session(minutes(200), 36, 'M1');
    const before = s.getSnapshot().replay.currentIndex;
    s.setTimeframe('H1');
    const snap = s.getSnapshot();
    expect(snap.timeframe).toBe('H1');
    expect(snap.replay.currentIndex).toBe(before);
    expect(snap.visibleCandles).toHaveLength(1);
    expect(snap.visibleCandles[0]).toMatchObject({ open: 100, high: 136, close: 136 }); // forming 00:00 H1 bar
    // Never contains a minute that has not been revealed.
    expect(snap.visibleCandles.at(-1)!.high).toBeLessThanOrEqual(136);
  });

  it('Previous steps back exactly one chart bar', () => {
    const s = m1Session(minutes(200), 59, 'M15'); // through 00:59
    s.previous();
    expect(s.getSnapshot().visibleCandles.at(-1)!.time).toBe(T0 + 30 * 60);
    expect(s.getSnapshot().replay.currentIndex).toBe(44);
    expect(s.getSnapshot().replay.atLiveEdge).toBe(false);
  });

  it('resolves SL/TP minute by minute even on a higher timeframe', () => {
    // A 15m bar whose range covers both SL and TP: on 1-minute data the order is known (TP first).
    const s = m1Session(minutes(200, { 40: { high: 160 }, 42: { low: 50 } }), 36, 'M15');
    s.placeOrder({ side: 'LONG', stopLoss: 90, takeProfit: 150, riskPercent: 1 }); // entry 136
    s.next();
    const trade = s.getSnapshot().trades[0];
    expect(trade).toMatchObject({ exitReason: 'TAKE_PROFIT', ambiguousExit: false });
    expect(hhmm(trade.exitCandleTime!)).toBe('00:40');
  });

  it('market orders fill at the close of the latest minute, timestamped at its close', () => {
    const s = m1Session(minutes(200), 36, 'H1');
    const result = s.placeOrder({ side: 'LONG', stopLoss: 120, takeProfit: 160, riskPercent: 1 });
    expect(result.ok && result.trade).toMatchObject({ entryPrice: 136, entryTime: '2026-01-15T00:37:00Z' });
  });

  it('reports time replayed since the start', () => {
    const s = m1Session(minutes(200), 36, 'M15');
    s.next();
    s.next();
    expect(s.getSnapshot().elapsedMs).toBe((59 - 36) * 60_000);
  });
});

describe('1D chart timeframe', () => {
  // Minutes from Monday 2026-01-12 00:00 UTC, two full days + part of Wednesday.
  const MON = Date.parse('2026-01-12T00:00:00Z') / 1000;
  const mins = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const time = MON + i * 60;
      return { time, timestamp: new Date(time * 1000).toISOString().replace('.000Z', 'Z'), open: 100 + i / 1000, high: 101 + i / 1000, low: 99 + i / 1000, close: 100 + i / 1000, volume: 1 };
    });
  const history = [
    { time: MON - 3 * 86_400, timestamp: '2026-01-09T00:00:00Z', open: 90, high: 95, low: 85, close: 92, volume: 1 },
    { time: MON - 86_400, timestamp: '2026-01-11T00:00:00Z', open: 92, high: 93, low: 91, close: 92.5, volume: 1 }, // Sunday → Monday
  ];
  const session = (start: number) =>
    new ReplaySession({ ...setup, granularity: 'D1' }, mins(3000), start, 0, vi.fn<CandleFetcher>(async () => []), FAR_FUTURE, undefined, history);
  const day = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

  it('shows months of daily history plus the forming day from revealed minutes', () => {
    const s = session(600); // Monday 10:00
    const bars = s.getSnapshot().visibleCandles;
    expect(bars.map((b) => day(b.time))).toEqual(['2026-01-09', '2026-01-12']);
    // Monday = Sunday history bar (open 92) + revealed Monday minutes only
    expect(bars[1]).toMatchObject({ open: 92, close: 100.6 });
    expect(bars[1].high).toBe(101.6); // nothing after the clock
  });

  it('Next completes the day, then reveals one full day; Previous steps back one day', () => {
    const s = session(600);
    s.next();
    expect(new Date(s.getSnapshot().clockMs).toISOString()).toBe('2026-01-13T00:00:00.000Z');
    s.next();
    expect(s.getSnapshot().visibleCandles.map((b) => day(b.time))).toEqual(['2026-01-09', '2026-01-12', '2026-01-13']);
    s.previous();
    expect(s.getSnapshot().visibleCandles.at(-1)!.time).toBe(MON);
  });
});

