/** Width and visibility of the right-hand order panel, remembered per browser. */
export interface PanelLayout {
  width: number;
  collapsed: boolean;
}

export const PANEL_MIN_WIDTH = 260;
export const PANEL_MAX_WIDTH = 560;
export const DEFAULT_PANEL_LAYOUT: PanelLayout = { width: 320, collapsed: false };
const STORAGE_KEY = 'backtrack.panelLayout.v1';

export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_PANEL_LAYOUT.width;
  return Math.round(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width)));
}

export function sanitizePanelLayout(input: unknown): PanelLayout {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Partial<Record<keyof PanelLayout, unknown>>;
  return {
    width: typeof raw.width === 'number' ? clampPanelWidth(raw.width) : DEFAULT_PANEL_LAYOUT.width,
    collapsed: typeof raw.collapsed === 'boolean' ? raw.collapsed : DEFAULT_PANEL_LAYOUT.collapsed,
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
