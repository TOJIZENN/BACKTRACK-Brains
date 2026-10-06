import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayEngine } from './replayEngine';
import { ReplayPlayer } from './replayPlayer';
import { makeCandles } from '../test/fixtures';

describe('ReplayPlayer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(start = 0, count = 20) {
    const engine = new ReplayEngine(makeCandles(count), start);
    const player = new ReplayPlayer(
      () => engine.next() !== null && engine.hasNext(),
      () => engine.getIntervalMs(),
    );
    return { engine, player };
  }

  it('reveals one candle per interval at 1x', () => {
    const { engine, player } = setup();
    player.start();
    vi.advanceTimersByTime(999);
    expect(engine.getState().currentIndex).toBe(0);
    vi.advanceTimersByTime(1);
    expect(engine.getState().currentIndex).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(engine.getState().currentIndex).toBe(4);
  });

  it('applies speed changes', () => {
    const { engine, player } = setup();
    engine.setSpeed(10);
    player.start();
    vi.advanceTimersByTime(1000);
    expect(engine.getState().currentIndex).toBe(10);
  });

  it('stops when paused', () => {
    const { engine, player } = setup();
    player.start();
    vi.advanceTimersByTime(2000);
    player.stop();
    vi.advanceTimersByTime(5000);
    expect(engine.getState().currentIndex).toBe(2);
    expect(player.isRunning).toBe(false);
  });

  it('stops by itself at the end of the data', () => {
    const { engine, player } = setup(15, 20);
    engine.setSpeed(5);
    player.start();
    vi.advanceTimersByTime(10_000);
    expect(engine.getState().currentIndex).toBe(19);
    expect(player.isRunning).toBe(false);
  });
});
