import { describe, expect, it } from 'vitest';
import { distanceToSegment, fibLevels, hitTestDrawing, rayEnd } from './geometry';
import { logicalToTime, timeToLogical } from './timeMapping';

const M5 = 300;
// Bars at 0, 300, 600, then a weekend-style gap to 3600, 3900
const bars = [0, 300, 600, 3600, 3900].map((time) => ({ time }));

describe('time ↔ logical mapping', () => {
  it('maps bar times to their index', () => {
    expect(timeToLogical(600, bars, M5)).toBe(2);
    expect(logicalToTime(2, bars, M5)).toBe(600);
    expect(logicalToTime(2.4, bars, M5)).toBe(600);
  });

  it('extrapolates beyond the last bar by bar duration (future area of the chart)', () => {
    expect(timeToLogical(3900 + 3 * M5, bars, M5)).toBe(7);
    expect(logicalToTime(7, bars, M5)).toBe(3900 + 3 * M5);
    expect(logicalToTime(-2, bars, M5)).toBe(-600);
    expect(timeToLogical(-600, bars, M5)).toBe(-2);
  });

  it('interpolates inside gaps', () => {
    expect(timeToLogical(2100, bars, M5)).toBeCloseTo(2.5);
  });

  it('round-trips every bar', () => {
    bars.forEach((b, i) => expect(logicalToTime(timeToLogical(b.time, bars, M5), bars, M5)).toBe(bars[i].time));
  });
});

describe('geometry', () => {
  it('distance to segment', () => {
    expect(distanceToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it('extends rays to the edge of the pane', () => {
    expect(rayEnd({ x: 0, y: 50 }, { x: 10, y: 50 }, 200, 100)).toEqual({ x: 200, y: 50 });
    expect(rayEnd({ x: 0, y: 0 }, { x: 10, y: 10 }, 200, 100)).toEqual({ x: 100, y: 100 });
  });

  it('computes fib retracement levels from the swing end', () => {
    const levels = fibLevels(100, 200);
    expect(levels[0]).toEqual({ ratio: 0, price: 200 });
    expect(levels.find((l) => l.ratio === 0.5)?.price).toBe(150);
    expect(levels.at(-1)).toEqual({ ratio: 1, price: 100 });
  });

  const size = { width: 500, height: 300 };
  it('hit-tests handles before bodies', () => {
    const pixels = [{ x: 10, y: 10 }, { x: 100, y: 100 }];
    expect(hitTestDrawing({ type: 'trendline' }, pixels, { x: 11, y: 12 }, size)).toEqual({ kind: 'handle', index: 0 });
    expect(hitTestDrawing({ type: 'trendline' }, pixels, { x: 55, y: 57 }, size)).toEqual({ kind: 'body' });
    expect(hitTestDrawing({ type: 'trendline' }, pixels, { x: 55, y: 90 }, size)).toBeNull();
  });

  it('hit-tests rays beyond their second point, lines across the pane, rectangles inside', () => {
    expect(hitTestDrawing({ type: 'ray' }, [{ x: 0, y: 50 }, { x: 10, y: 50 }], { x: 400, y: 52 }, size)).toEqual({ kind: 'body' });
    expect(hitTestDrawing({ type: 'hline' }, [{ x: 10, y: 80 }], { x: 450, y: 84 }, size)).toEqual({ kind: 'body' });
    expect(hitTestDrawing({ type: 'vline' }, [{ x: 200, y: 80 }], { x: 203, y: 290 }, size)).toEqual({ kind: 'body' });
    expect(hitTestDrawing({ type: 'rectangle' }, [{ x: 10, y: 10 }, { x: 100, y: 100 }], { x: 50, y: 50 }, size)).toEqual({ kind: 'body' });
    expect(hitTestDrawing({ type: 'rectangle' }, [{ x: 10, y: 10 }, { x: 100, y: 100 }], { x: 150, y: 50 }, size)).toBeNull();
  });

  it('hit-tests every path segment', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(hitTestDrawing({ type: 'path' }, path, { x: 103, y: 50 }, size)).toEqual({ kind: 'body' });
    expect(hitTestDrawing({ type: 'path' }, path, { x: 50, y: 50 }, size)).toBeNull();
  });
});
