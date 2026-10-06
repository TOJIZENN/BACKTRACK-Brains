import { describe, expect, it } from 'vitest';
import { makeCandle, makeCandles } from '../test/fixtures';
import { BASE_CANDLE_INTERVAL_MS, ReplayEngine } from './replayEngine';

describe('ReplayEngine', () => {
  const candles = makeCandles(10);

  it('starts with only candles up to the start index visible', () => {
    const engine = new ReplayEngine(candles, 4);
    expect(engine.getVisibleCandles()).toEqual(candles.slice(0, 5));
    expect(engine.getCurrentCandle()).toBe(candles[4]);
    expect(engine.getState()).toMatchObject({
      startIndex: 4,
      currentIndex: 4,
      maxRevealedIndex: 4,
      speed: 1,
      atLiveEdge: true,
      atEndOfData: false,
    });
  });

  it('never exposes future candles through its public surface', () => {
    const engine = new ReplayEngine(candles, 4);
    const futureTimes = candles.slice(5).map((c) => c.timestamp);
    const exposed = JSON.stringify([engine, engine.getState(), engine.getVisibleCandles(), engine.getCurrentCandle()]);
    for (const t of futureTimes) expect(exposed).not.toContain(t);
    expect(Object.isFrozen(engine.getVisibleCandles())).toBe(true);
  });

  it('copies the input so external mutation cannot leak data in', () => {
    const input = makeCandles(5);
    const engine = new ReplayEngine(input, 2);
    input.length = 0;
    expect(engine.getVisibleCandles()).toHaveLength(3);
  });

  it('next() reveals exactly one new candle', () => {
    const engine = new ReplayEngine(candles, 4);
    const step = engine.next();
    expect(step).toEqual({ candle: candles[5], isNew: true });
    expect(engine.getVisibleCandles()).toEqual(candles.slice(0, 6));
    expect(engine.getState().maxRevealedIndex).toBe(5);
  });

  it('previous() steps back and leaves the live edge', () => {
    const engine = new ReplayEngine(candles, 4);
    engine.next();
    expect(engine.previous()).toBe(true);
    expect(engine.getVisibleCandles()).toEqual(candles.slice(0, 5));
    expect(engine.getState()).toMatchObject({ currentIndex: 4, maxRevealedIndex: 5, atLiveEdge: false });
  });

  it('re-revealing an already seen candle is not "new" (no double trade resolution)', () => {
    const engine = new ReplayEngine(candles, 4);
    engine.next();
    engine.previous();
    expect(engine.next()).toEqual({ candle: candles[5], isNew: false });
    expect(engine.getState().atLiveEdge).toBe(true);
    expect(engine.next()?.isNew).toBe(true);
  });

  it('previous() stops at the first candle', () => {
    const engine = new ReplayEngine(candles, 0);
    expect(engine.previous()).toBe(false);
    expect(engine.getState().currentIndex).toBe(0);
  });

  it('reset() returns to the start and forgets revealed candles', () => {
    const engine = new ReplayEngine(candles, 4);
    engine.next();
    engine.next();
    engine.reset();
    expect(engine.getState()).toMatchObject({ currentIndex: 4, maxRevealedIndex: 4, atLiveEdge: true });
    expect(engine.getVisibleCandles()).toEqual(candles.slice(0, 5));
    expect(engine.next()?.isNew).toBe(true);
  });

  it('stops at the end of the dataset', () => {
    const engine = new ReplayEngine(candles, 8);
    expect(engine.next()?.candle).toBe(candles[9]);
    expect(engine.getState().atEndOfData).toBe(true);
    expect(engine.next()).toBeNull();
    expect(engine.getState().currentIndex).toBe(9);
  });

  it('replay speed controls the reveal interval', () => {
    const engine = new ReplayEngine(candles, 4);
    expect(engine.getIntervalMs()).toBe(BASE_CANDLE_INTERVAL_MS);
    engine.setSpeed(0.5);
    expect(engine.getIntervalMs()).toBe(BASE_CANDLE_INTERVAL_MS * 2);
    engine.setSpeed(10);
    expect(engine.getIntervalMs()).toBe(BASE_CANDLE_INTERVAL_MS / 10);
    expect(() => engine.setSpeed(3 as never)).toThrow(RangeError);
  });

  it('rejects invalid start indexes and empty datasets', () => {
    expect(() => new ReplayEngine([], 0)).toThrow();
    expect(() => new ReplayEngine(candles, -1)).toThrow(RangeError);
    expect(() => new ReplayEngine(candles, 10)).toThrow(RangeError);
  });

  it('appends only newer candles and keeps the visible window unchanged', () => {
    const engine = new ReplayEngine(candles, 9);
    expect(engine.appendCandles([candles[9], makeCandle(11), makeCandle(10)])).toBe(2);
    expect(engine.getVisibleCandles()).toHaveLength(10);
    expect(engine.bufferedAhead()).toBe(2);
    expect(engine.next()?.candle.time).toBe(makeCandle(10).time);
  });

  it('returns a stable visible array between position changes', () => {
    const engine = new ReplayEngine(candles, 4);
    const first = engine.getVisibleCandles();
    expect(engine.getVisibleCandles()).toBe(first);
    engine.next();
    expect(engine.getVisibleCandles()).not.toBe(first);
  });
});
