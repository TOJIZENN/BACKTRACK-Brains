import type { DrawingLayer } from './drawingLayer';
import type { Point } from './geometry';
import {
  DEFAULT_DRAWING_COLOR,
  DEFAULT_DRAWING_WIDTH,
  POINTS_REQUIRED,
  type AnchorPoint,
  type Drawing,
  type DrawingTool,
  type DrawingType,
} from './types';

export interface DrawingCallbacks {
  onDrawingsChange: (drawings: Drawing[]) => void;
  onSelectionChange: (id: string | null) => void;
  onToolChange: (tool: DrawingTool) => void;
}

type Drag =
  | { mode: 'handle'; id: string; index: number }
  | { mode: 'move'; id: string; start: Point; startLogical: number; startPrice: number; original: AnchorPoint[] };

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

let idCounter = 0;
const newId = () => `drawing-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/**
 * Mouse/keyboard interaction for chart drawings (TradingView style):
 * pick a tool → click points → the new drawing is selected and the tool returns to the cursor;
 * in cursor mode click a drawing to select it, drag its handles or body, Delete removes it.
 *
 * Pointer events are captured on the chart container before Lightweight Charts sees them; when a
 * drawing gesture starts, the matching mousedown/touchstart is swallowed so the chart doesn't pan.
 */
export class DrawingController {
  readonly #container: HTMLElement;
  readonly #layer: DrawingLayer;
  readonly #cb: DrawingCallbacks;
  #tool: DrawingTool = 'cursor';
  #drawings: Drawing[] = [];
  #draft: Drawing | null = null;
  #selectedId: string | null = null;
  #drag: Drag | null = null;
  #ownsGesture = false;
  #style = { color: DEFAULT_DRAWING_COLOR, width: DEFAULT_DRAWING_WIDTH };
  readonly #cleanups: (() => void)[] = [];

  constructor(container: HTMLElement, layer: DrawingLayer, callbacks: DrawingCallbacks) {
    this.#container = container;
    this.#layer = layer;
    this.#cb = callbacks;
    this.#listen(container, 'pointerdown', (e) => this.#onPointerDown(e as PointerEvent), true);
    // Swallow the legacy events Lightweight Charts listens to while we own the gesture.
    for (const type of ['mousedown', 'touchstart', 'dblclick'] as const) {
      this.#listen(container, type, (e) => this.#ownsGesture && e.stopPropagation(), true);
    }
    this.#listen(container, 'pointermove', (e) => this.#onPointerMove(e as PointerEvent));
    this.#listen(window, 'pointerup', () => this.#onPointerUp());
    this.#listen(container, 'dblclick', () => this.#finishPath(), true);
    this.#listen(window, 'keydown', (e) => this.#onKeyDown(e as KeyboardEvent));
  }

  destroy(): void {
    this.#cleanups.forEach((fn) => fn());
  }

  // ---- external API ----
  setTool(tool: DrawingTool): void {
    if (tool === this.#tool) return;
    this.#tool = tool;
    this.#draft = null;
    if (tool !== 'cursor') this.#select(null);
    this.#container.style.cursor = tool === 'cursor' ? '' : 'crosshair';
    this.#render();
  }

  /** Replaces drawings from outside (e.g. React state). Same array instance → no-op. */
  setDrawings(drawings: readonly Drawing[]): void {
    if (drawings === this.#drawings) return;
    this.#drawings = [...drawings];
    if (this.#selectedId && !this.#drawings.some((d) => d.id === this.#selectedId)) this.#select(null);
    this.#render();
  }

  /** Style for new drawings and, when one is selected, applies it to the selection. */
  setStyle(style: { color?: string; width?: number }): void {
    this.#style = { ...this.#style, ...style };
    if (this.#selectedId) this.#updateDrawing(this.#selectedId, (d) => ({ ...d, ...style }));
  }

  deleteSelected(): void {
    if (!this.#selectedId) return;
    const id = this.#selectedId;
    this.#select(null);
    this.#commit(this.#drawings.filter((d) => d.id !== id));
  }

  clearAll(): void {
    this.#draft = null;
    this.#select(null);
    this.#commit([]);
  }

  // ---- events ----
  #listen(target: EventTarget, type: string, handler: (e: Event) => void, capture = false): void {
    target.addEventListener(type, handler, capture);
    this.#cleanups.push(() => target.removeEventListener(type, handler, capture));
  }

  #localPoint(e: MouseEvent): Point | null {
    const rect = this.#container.getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const pane = this.#layer.paneSize();
    // Ignore the price and time scales — they keep their normal behaviour.
    return p.x >= 0 && p.y >= 0 && p.x <= pane.width && p.y <= pane.height ? p : null;
  }

  #own(e: Event): void {
    this.#ownsGesture = true;
    e.stopPropagation();
    e.preventDefault();
  }

  #onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const p = this.#localPoint(e);
    if (!p) return;

    if (this.#tool !== 'cursor') {
      this.#own(e);
      this.#addPoint(p);
      return;
    }

    const found = this.#layer.findDrawingAt(p);
    if (!found) {
      this.#select(null);
      return; // let the chart pan
    }
    this.#own(e);
    this.#select(found.drawing.id);
    if (found.hit.kind === 'handle') {
      this.#drag = { mode: 'handle', id: found.drawing.id, index: found.hit.index };
    } else {
      const anchor = this.#layer.toAnchor(p);
      const logical = this.#layer.logicalAt(p.x);
      if (anchor && logical !== null) {
        this.#drag = { mode: 'move', id: found.drawing.id, start: p, startLogical: logical, startPrice: anchor.price, original: found.drawing.points };
      }
    }
  }

  #onPointerMove(e: PointerEvent): void {
    const p = this.#localPoint(e);
    if (!p) return;
    if (this.#drag) {
      this.#applyDrag(p);
      return;
    }
    if (this.#draft) {
      const anchor = this.#layer.toAnchor(p);
      if (anchor) {
        this.#draft = { ...this.#draft, points: [...this.#draft.points.slice(0, -1), anchor] };
        this.#render();
      }
      return;
    }
    if (this.#tool === 'cursor') {
      const found = this.#layer.findDrawingAt(p);
      this.#container.style.cursor = found ? (found.hit.kind === 'handle' ? 'grab' : 'pointer') : '';
    }
  }

  #onPointerUp(): void {
    if (this.#drag) {
      this.#drag = null;
      this.#cb.onDrawingsChange([...this.#drawings]);
    }
    // Keep owning until the synthetic mousedown/dblclick of this gesture has been swallowed.
    setTimeout(() => {
      this.#ownsGesture = false;
    }, 0);
  }

  #onKeyDown(e: KeyboardEvent): void {
    if (isTypingTarget(e.target)) return;
    if (e.key === 'Escape') {
      if (this.#draft?.type === 'path' && this.#draft.points.length > 2) this.#finishPath();
      else if (this.#draft || this.#tool !== 'cursor') {
        this.#draft = null;
        this.#setToolInternal('cursor');
      } else this.#select(null);
      this.#render();
    } else if (e.key === 'Enter' && this.#draft?.type === 'path') {
      e.preventDefault();
      this.#finishPath();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.#selectedId) {
      e.preventDefault();
      this.deleteSelected();
    }
  }

  // ---- creation ----
  #addPoint(p: Point): void {
    const anchor = this.#layer.toAnchor(p);
    if (!anchor || this.#tool === 'cursor') return;
    const type = this.#tool as DrawingType;
    const required = POINTS_REQUIRED[type];

    if (!this.#draft) {
      if (required === 1) {
        this.#finish({ id: newId(), type, points: [anchor], ...this.#style });
        return;
      }
      // Second point follows the mouse until the next click.
      this.#draft = { id: newId(), type, points: [anchor, anchor], ...this.#style };
      this.#render();
      return;
    }

    const fixed = [...this.#draft.points.slice(0, -1), anchor];
    if (required !== null && fixed.length >= required) {
      this.#finish({ ...this.#draft, points: fixed });
    } else {
      this.#draft = { ...this.#draft, points: [...fixed, anchor] };
      this.#render();
    }
  }

  #finishPath(): void {
    if (this.#draft?.type !== 'path') return;
    // Drop the floating preview point and duplicates left by the double-click.
    const points = this.#draft.points
      .slice(0, -1)
      .filter((p, i, all) => i === 0 || p.time !== all[i - 1].time || p.price !== all[i - 1].price);
    if (points.length < 2) {
      this.#draft = null;
      this.#render();
      return;
    }
    this.#finish({ ...this.#draft, points });
  }

  #finish(drawing: Drawing): void {
    this.#draft = null;
    this.#commit([...this.#drawings, drawing]);
    this.#setToolInternal('cursor');
    this.#select(drawing.id);
  }

  // ---- editing ----
  #applyDrag(p: Point): void {
    const drag = this.#drag;
    if (!drag) return;
    if (drag.mode === 'handle') {
      const anchor = this.#layer.toAnchor(p);
      if (!anchor) return;
      this.#updateDrawing(drag.id, (d) => ({ ...d, points: d.points.map((pt, i) => (i === drag.index ? anchor : pt)) }), false);
      return;
    }
    const logical = this.#layer.logicalAt(p.x);
    const anchor = this.#layer.toAnchor(p);
    if (logical === null || !anchor) return;
    const bars = Math.round(logical - drag.startLogical);
    const priceDelta = anchor.price - drag.startPrice;
    this.#updateDrawing(drag.id, (d) => ({ ...d, points: drag.original.map((pt) => this.#layer.shiftAnchor(pt, bars, priceDelta)) }), false);
  }

  #updateDrawing(id: string, change: (d: Drawing) => Drawing, notify = true): void {
    const next = this.#drawings.map((d) => (d.id === id ? change(d) : d));
    if (notify) this.#commit(next);
    else {
      this.#drawings = next;
      this.#render();
    }
  }

  #commit(drawings: Drawing[]): void {
    this.#drawings = drawings;
    this.#render();
    this.#cb.onDrawingsChange([...drawings]);
  }

  #select(id: string | null): void {
    if (id === this.#selectedId) return;
    this.#selectedId = id;
    this.#render();
    this.#cb.onSelectionChange(id);
  }

  #setToolInternal(tool: DrawingTool): void {
    this.setTool(tool);
    this.#cb.onToolChange(tool);
  }

  #render(): void {
    this.#layer.setState(this.#drawings, this.#draft, this.#selectedId);
  }
}
