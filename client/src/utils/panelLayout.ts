/** Size of the bottom dashboard, remembered per browser. */
export interface PanelLayout {
  /** Bottom dashboard content height (px), excluding its header strip */
  bottomHeight: number;
  bottomCollapsed: boolean;
}

export const BOTTOM_MIN_HEIGHT = 140;
export const BOTTOM_MAX_HEIGHT = 640;
/** Dragging the bottom panel below this height collapses it to its header strip. */
export const BOTTOM_COLLAPSE_THRESHOLD = 70;
/** Viewport height kept for the header, chart and replay controls when the bottom panel is dragged up. */
export const CHART_MIN_RESERVED_HEIGHT = 460;

export const DEFAULT_PANEL_LAYOUT: PanelLayout = { bottomHeight: 260, bottomCollapsed: false };
const STORAGE_KEY = 'backtrack.panelLayout.v1';

export function clampBottomHeight(height: number, maxHeight: number = BOTTOM_MAX_HEIGHT): number {
  if (!Number.isFinite(height)) return DEFAULT_PANEL_LAYOUT.bottomHeight;
  const max = Math.max(BOTTOM_MIN_HEIGHT, Math.min(BOTTOM_MAX_HEIGHT, maxHeight));
  return Math.round(Math.min(max, Math.max(BOTTOM_MIN_HEIGHT, height)));
}

/**
 * Applies a drag of the bottom panel to `requested` px. Below the threshold it collapses (keeping the
 * last height so it reopens at the same size); otherwise it opens at the clamped height.
 */
export function resolveBottomDrag(layout: PanelLayout, requested: number, maxHeight?: number): PanelLayout {
  if (requested < BOTTOM_COLLAPSE_THRESHOLD) return { ...layout, bottomCollapsed: true };
  return { ...layout, bottomCollapsed: false, bottomHeight: clampBottomHeight(requested, maxHeight) };
}

export function sanitizePanelLayout(input: unknown): PanelLayout {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Partial<Record<keyof PanelLayout, unknown>>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    bottomHeight: typeof raw.bottomHeight === 'number' ? clampBottomHeight(raw.bottomHeight) : DEFAULT_PANEL_LAYOUT.bottomHeight,
    bottomCollapsed: bool(raw.bottomCollapsed, DEFAULT_PANEL_LAYOUT.bottomCollapsed),
  };
}

export function loadPanelLayout(): PanelLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return sanitizePanelLayout(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_PANEL_LAYOUT };
  }
}

export function savePanelLayout(layout: PanelLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage unavailable — layout simply won't persist.
  }
}
