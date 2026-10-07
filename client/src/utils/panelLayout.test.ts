import { describe, expect, it } from 'vitest';
import {
  BOTTOM_MIN_HEIGHT,
  clampBottomHeight,
  clampPanelWidth,
  DEFAULT_PANEL_LAYOUT,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  resolveBottomDrag,
  sanitizePanelLayout,
} from './panelLayout';

describe('panel layout', () => {
  it('clamps the order panel width', () => {
    expect(clampPanelWidth(100)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(5000)).toBe(PANEL_MAX_WIDTH);
    expect(clampPanelWidth(400.6)).toBe(401);
    expect(clampPanelWidth(Number.NaN)).toBe(DEFAULT_PANEL_LAYOUT.width);
  });

  it('clamps the bottom height, including to the space the viewport allows', () => {
    expect(clampBottomHeight(50)).toBe(BOTTOM_MIN_HEIGHT);
    expect(clampBottomHeight(500, 400)).toBe(400);
    expect(clampBottomHeight(500, 10)).toBe(BOTTOM_MIN_HEIGHT);
  });

  it('collapses when dragged below the threshold and reopens at the dragged height', () => {
    const collapsed = resolveBottomDrag({ ...DEFAULT_PANEL_LAYOUT, bottomHeight: 300 }, 30);
    expect(collapsed).toMatchObject({ bottomCollapsed: true, bottomHeight: 300 });
    expect(resolveBottomDrag(collapsed, 100)).toMatchObject({ bottomCollapsed: false, bottomHeight: BOTTOM_MIN_HEIGHT });
    expect(resolveBottomDrag(collapsed, 350, 600)).toMatchObject({ bottomCollapsed: false, bottomHeight: 350 });
  });

  it('sanitizes stored values and fills fields missing from older saves', () => {
    expect(sanitizePanelLayout(null)).toEqual(DEFAULT_PANEL_LAYOUT);
    expect(sanitizePanelLayout({ width: 9999, collapsed: true })).toEqual({ ...DEFAULT_PANEL_LAYOUT, width: PANEL_MAX_WIDTH, collapsed: true });
    expect(sanitizePanelLayout({ width: '300', collapsed: 'yes', bottomHeight: 'x', bottomCollapsed: 1 })).toEqual(DEFAULT_PANEL_LAYOUT);
  });
});
