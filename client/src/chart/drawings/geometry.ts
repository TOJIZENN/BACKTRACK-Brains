import { FIB_LEVELS, type Drawing } from './types';

export interface Point {
  x: number;
  y: number;
}

/** Hit tolerance in CSS pixels */
export const HIT_TOLERANCE = 6;

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Point where the ray a→b leaves the box [0,width]×[0,height] (or b if it doesn't move). */
export function rayEnd(a: Point, b: Point, width: number, height: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return b;
  const candidates: number[] = [];
  if (dx > 0) candidates.push((width - a.x) / dx);
  if (dx < 0) candidates.push(-a.x / dx);
  if (dy > 0) candidates.push((height - a.y) / dy);
  if (dy < 0) candidates.push(-a.y / dy);
  const t = Math.max(1, Math.min(...candidates.filter((c) => c > 0), 1e6));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export interface FibLevel {
  ratio: number;
  price: number;
}

/** Retracement levels from the swing end (0) back to the swing start (1), TradingView style. */
export function fibLevels(startPrice: number, endPrice: number): FibLevel[] {
  return FIB_LEVELS.map((ratio) => ({ ratio, price: endPrice + (startPrice - endPrice) * ratio }));
}

export type DrawingHit = { kind: 'handle'; index: number } | { kind: 'body' };

/**
 * Hit-tests one drawing given its anchor points already converted to pixels.
 * `fibY` maps a price to y for fib levels. Handles are checked first so endpoints win over the line.
 */
export function hitTestDrawing(
  drawing: Pick<Drawing, 'type'>,
  pixels: Point[],
  cursor: Point,
  size: { width: number; height: number },
  fibY?: (price: number) => number,
  fibPrices?: number[],
): DrawingHit | null {
  const near = (d: number) => d <= HIT_TOLERANCE;
  for (let i = 0; i < pixels.length; i++) {
    if (Math.hypot(cursor.x - pixels[i].x, cursor.y - pixels[i].y) <= HIT_TOLERANCE + 2) return { kind: 'handle', index: i };
  }
  const [a, b] = pixels;
  switch (drawing.type) {
    case 'trendline':
      return a && b && near(distanceToSegment(cursor, a, b)) ? { kind: 'body' } : null;
    case 'ray':
      return a && b && near(distanceToSegment(cursor, a, rayEnd(a, b, size.width, size.height))) ? { kind: 'body' } : null;
    case 'hline':
      return a && near(Math.abs(cursor.y - a.y)) ? { kind: 'body' } : null;
    case 'vline':
      return a && near(Math.abs(cursor.x - a.x)) ? { kind: 'body' } : null;
    case 'rectangle': {
      if (!a || !b) return null;
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      const top = Math.min(a.y, b.y);
      const bottom = Math.max(a.y, b.y);
      const inside = cursor.x >= left - HIT_TOLERANCE && cursor.x <= right + HIT_TOLERANCE && cursor.y >= top - HIT_TOLERANCE && cursor.y <= bottom + HIT_TOLERANCE;
      return inside ? { kind: 'body' } : null;
    }
    case 'path':
      for (let i = 1; i < pixels.length; i++) {
        if (near(distanceToSegment(cursor, pixels[i - 1], pixels[i]))) return { kind: 'body' };
      }
      return null;
    case 'fib': {
      if (!a || !b || !fibY || !fibPrices) return null;
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      if (cursor.x < left - HIT_TOLERANCE || cursor.x > right + HIT_TOLERANCE) return null;
      return fibPrices.some((price) => near(Math.abs(cursor.y - fibY(price)))) || near(distanceToSegment(cursor, a, b))
        ? { kind: 'body' }
        : null;
    }
  }
}
