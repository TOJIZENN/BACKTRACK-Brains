import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import { fibLevels, hitTestDrawing, rayEnd, type DrawingHit, type Point } from './geometry';
import { logicalToTime, timeToLogical } from './timeMapping';
import type { AnchorPoint, Drawing } from './types';

type RenderTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];
type Ctx = CanvasRenderingContext2D;

const HANDLE_RADIUS = 5;
const RECT_FILL_ALPHA = 0.15;
const LABEL_FONT = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';

export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

interface Timed {
  time: number;
}

/**
 * Series primitive that renders user drawings and converts between chart pixels and anchors.
 * Holds no interaction logic — see DrawingController.
 */
export class DrawingLayer implements ISeriesPrimitive<Time> {
  readonly #chart: IChartApi;
  readonly #series: ISeriesApi<'Candlestick'>;
  readonly #barSeconds: number;
  #pricePrecision: number;
  #bars: readonly Timed[] = [];
  #drawings: readonly Drawing[] = [];
  #draft: Drawing | null = null;
  #selectedId: string | null = null;
  #handleFill = '#131722';
  #requestUpdate: (() => void) | null = null;
  readonly #view: IPrimitivePaneView;

  constructor(chart: IChartApi, series: ISeriesApi<'Candlestick'>, barSeconds: number, pricePrecision: number) {
    this.#chart = chart;
    this.#series = series;
    this.#barSeconds = barSeconds;
    this.#pricePrecision = pricePrecision;
    const renderer: IPrimitivePaneRenderer = { draw: (target) => this.#draw(target) };
    this.#view = { zOrder: () => 'top', renderer: () => renderer };
  }

  // ---- ISeriesPrimitive ----
  attached({ requestUpdate }: SeriesAttachedParameter<Time>): void {
    this.#requestUpdate = requestUpdate;
  }
  detached(): void {
    this.#requestUpdate = null;
  }
  paneViews(): readonly IPrimitivePaneView[] {
    return [this.#view];
  }

  // ---- state ----
  setBars(bars: readonly Timed[]): void {
    this.#bars = bars;
    this.update();
  }
  setState(drawings: readonly Drawing[], draft: Drawing | null, selectedId: string | null): void {
    this.#drawings = drawings;
    this.#draft = draft;
    this.#selectedId = selectedId;
    this.update();
  }
  setHandleFill(color: string): void {
    this.#handleFill = color;
    this.update();
  }
  update(): void {
    this.#requestUpdate?.();
  }

  // ---- projection ----
  paneSize(): { width: number; height: number } {
    return this.#chart.paneSize(0);
  }
  toPixel(anchor: AnchorPoint): Point | null {
    const logical = timeToLogical(anchor.time, this.#bars, this.#barSeconds);
    const x = this.#chart.timeScale().logicalToCoordinate(logical as Logical);
    const y = this.#series.priceToCoordinate(anchor.price);
    return x === null || y === null ? null : { x, y };
  }
  priceToY(price: number): number | null {
    return this.#series.priceToCoordinate(price);
  }
  /** Anchor under a pixel; null outside the data/price range. */
  toAnchor(p: Point): AnchorPoint | null {
    const logical = this.#chart.timeScale().coordinateToLogical(p.x);
    const price = this.#series.coordinateToPrice(p.y);
    if (logical === null || price === null) return null;
    const time = logicalToTime(logical, this.#bars, this.#barSeconds);
    if (!Number.isFinite(time)) return null;
    const factor = 10 ** this.#pricePrecision;
    return { time, price: Math.round(price * factor) / factor };
  }
  logicalAt(x: number): number | null {
    return this.#chart.timeScale().coordinateToLogical(x);
  }
  /** Moves an anchor by whole bars and a price delta (used when dragging a drawing). */
  shiftAnchor(anchor: AnchorPoint, bars: number, priceDelta: number): AnchorPoint {
    const logical = timeToLogical(anchor.time, this.#bars, this.#barSeconds) + bars;
    const factor = 10 ** this.#pricePrecision;
    return { time: logicalToTime(logical, this.#bars, this.#barSeconds), price: Math.round((anchor.price + priceDelta) * factor) / factor };
  }

  /** Topmost drawing under the cursor; the selected drawing wins so its handles stay grabbable. */
  findDrawingAt(p: Point): { drawing: Drawing; hit: DrawingHit } | null {
    const size = this.paneSize();
    const ordered = [...this.#drawings].reverse().sort((a, b) => Number(b.id === this.#selectedId) - Number(a.id === this.#selectedId));
    for (const drawing of ordered) {
      const pixels = drawing.points.map((a) => this.toPixel(a));
      if (pixels.some((px) => px === null)) continue;
      const fibPrices = drawing.type === 'fib' ? fibLevels(drawing.points[0].price, drawing.points[1].price).map((l) => l.price) : undefined;
      const hit = hitTestDrawing(drawing, pixels as Point[], p, size, (price) => this.priceToY(price) ?? Number.NaN, fibPrices);
      // Only the selected drawing exposes draggable handles; others are picked by their body.
      if (hit) return { drawing, hit: hit.kind === 'handle' && drawing.id !== this.#selectedId ? { kind: 'body' } : hit };
    }
    return null;
  }

  // ---- rendering ----
  #draw(target: RenderTarget): void {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const all = this.#draft ? [...this.#drawings, this.#draft] : this.#drawings;
      for (const drawing of all) {
        const pixels = drawing.points.map((a) => this.toPixel(a));
        if (pixels.some((px) => px === null)) continue;
        ctx.save();
        this.#drawShape(ctx, drawing, pixels as Point[], mediaSize);
        ctx.restore();
        if (drawing.id === this.#selectedId || drawing === this.#draft) this.#drawHandles(ctx, drawing.color, pixels as Point[]);
      }
    });
  }

  #drawShape(ctx: Ctx, d: Drawing, px: Point[], size: { width: number; height: number }): void {
    ctx.strokeStyle = d.color;
    ctx.lineWidth = d.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const line = (a: Point, b: Point) => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    const [a, b] = px;
    switch (d.type) {
      case 'trendline':
        line(a, b);
        break;
      case 'ray':
        line(a, rayEnd(a, b, size.width, size.height));
        break;
      case 'hline':
        line({ x: 0, y: a.y }, { x: size.width, y: a.y });
        this.#priceTag(ctx, d.color, d.points[0].price, size.width, a.y);
        break;
      case 'vline':
        line({ x: a.x, y: 0 }, { x: a.x, y: size.height });
        break;
      case 'rectangle': {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        ctx.fillStyle = withAlpha(d.color, RECT_FILL_ALPHA);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        break;
      }
      case 'path':
        ctx.beginPath();
        px.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        break;
      case 'fib': {
        const left = Math.min(a.x, b.x);
        const right = Math.max(a.x, b.x);
        ctx.font = LABEL_FONT;
        ctx.textBaseline = 'bottom';
        for (const level of fibLevels(d.points[0].price, d.points[1].price)) {
          const y = this.priceToY(level.price);
          if (y === null) continue;
          ctx.lineWidth = level.ratio === 0 || level.ratio === 1 ? d.width : Math.max(1, d.width - 1);
          line({ x: left, y }, { x: right, y });
          ctx.fillStyle = d.color;
          ctx.fillText(`${level.ratio} (${level.price.toFixed(this.#pricePrecision)})`, left + 4, y - 2);
        }
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        line(a, b);
        break;
      }
    }
  }

  #priceTag(ctx: Ctx, color: string, price: number, width: number, y: number): void {
    const text = price.toFixed(this.#pricePrecision);
    ctx.font = LABEL_FONT;
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = color;
    ctx.fillRect(width - w - 2, y - 9, w, 18);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width - w + 2, y);
  }

  #drawHandles(ctx: Ctx, color: string, px: Point[]): void {
    for (const p of px) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = this.#handleFill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }
}
