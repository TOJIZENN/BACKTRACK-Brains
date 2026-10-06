import type { Candle } from '../types/market';

export const REPLAY_SPEEDS = [0.5, 1, 2, 5, 10] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** Time between revealed candles at 1x speed. */
export const BASE_CANDLE_INTERVAL_MS = 1000;

export interface ReplayState {
  startIndex: number;
  currentIndex: number;
  /** Furthest candle ever revealed in this run. Candles up to here have already been "lived through". */
  maxRevealedIndex: number;
  speed: ReplaySpeed;
  /** True when the current candle is the furthest revealed one — the only place new trades are allowed. */
  atLiveEdge: boolean;
  /** True when no further candle is available in the loaded dataset. */
  atEndOfData: boolean;
}

export interface StepResult {
  candle: Candle;
  /** True only the first time this candle is revealed. Trade resolution must only run on new candles. */
  isNew: boolean;
}

/**
 * Candle-by-candle replay over a historical dataset. Owns the replay position and speed;
 * playback timing lives in ReplayPlayer.
 *
 * Anti-lookahead contract: the full dataset is held in a private field and never exposed.
 * Consumers can only read candles up to `currentIndex` via `getVisibleCandles()` / `getCurrentCandle()`.
 */
export class ReplayEngine {
  readonly #candles: Candle[];
  readonly #startIndex: number;
  #currentIndex: number;
  #maxRevealedIndex: number;
  #speed: ReplaySpeed;
  #visibleCache: readonly Candle[] | null = null;

  constructor(candles: readonly Candle[], startIndex: number, speed: ReplaySpeed = 1) {
    if (candles.length === 0) throw new Error('Replay requires at least one candle.');
    if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= candles.length) {
      throw new RangeError(`Replay start index ${startIndex} is outside the dataset (0..${candles.length - 1}).`);
    }
    this.#candles = [...candles];
    this.#startIndex = startIndex;
    this.#currentIndex = startIndex;
    this.#maxRevealedIndex = startIndex;
    this.#speed = speed;
  }

  getState(): ReplayState {
    return {
      startIndex: this.#startIndex,
      currentIndex: this.#currentIndex,
      maxRevealedIndex: this.#maxRevealedIndex,
      speed: this.#speed,
      atLiveEdge: this.#currentIndex === this.#maxRevealedIndex,
      atEndOfData: !this.hasNext(),
    };
  }

  /** Candles [0..currentIndex]. Returns the same array instance until the replay position changes. */
  getVisibleCandles(): readonly Candle[] {
    this.#visibleCache ??= Object.freeze(this.#candles.slice(0, this.#currentIndex + 1));
    return this.#visibleCache;
  }

  getCurrentCandle(): Candle {
    return this.#candles[this.#currentIndex];
  }

  /** The furthest candle revealed so far (equals the current candle unless the user stepped back). */
  getLiveEdgeCandle(): Candle {
    return this.#candles[this.#maxRevealedIndex];
  }

  hasNext(): boolean {
    return this.#currentIndex < this.#candles.length - 1;
  }

  /** How many loaded-but-unrevealed candles remain. Used only to decide when to prefetch more data. */
  bufferedAhead(): number {
    return this.#candles.length - 1 - this.#currentIndex;
  }

  /** Reveals exactly one more candle. Returns null at the end of the dataset. */
  next(): StepResult | null {
    if (!this.hasNext()) return null;
    this.#moveTo(this.#currentIndex + 1);
    const isNew = this.#currentIndex > this.#maxRevealedIndex;
    if (isNew) this.#maxRevealedIndex = this.#currentIndex;
    return { candle: this.getCurrentCandle(), isNew };
  }

  /** Steps back one candle for review. Never goes before the first loaded candle. */
  previous(): boolean {
    if (this.#currentIndex === 0) return false;
    this.#moveTo(this.#currentIndex - 1);
    return true;
  }

  /** Returns to the original starting point and forgets everything revealed since. */
  reset(): void {
    this.#moveTo(this.#startIndex);
    this.#maxRevealedIndex = this.#startIndex;
  }

  setSpeed(speed: ReplaySpeed): void {
    if (!REPLAY_SPEEDS.includes(speed)) throw new RangeError(`Unsupported replay speed: ${speed}`);
    this.#speed = speed;
  }

  getIntervalMs(): number {
    return BASE_CANDLE_INTERVAL_MS / this.#speed;
  }

  /** Extends the dataset with later candles (e.g. prefetched data). Older/duplicate candles are ignored. */
  appendCandles(candles: readonly Candle[]): number {
    const lastTime = this.#candles[this.#candles.length - 1].time;
    const fresh = candles.filter((c) => c.time > lastTime).sort((a, b) => a.time - b.time);
    this.#candles.push(...fresh);
    return fresh.length;
  }

  #moveTo(index: number): void {
    this.#currentIndex = index;
    this.#visibleCache = null;
  }
}
