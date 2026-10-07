import { describe, expect, it } from 'vitest';
import {
  BOTTOM_MIN_HEIGHT,
  clampBottomHeight,
  DEFAULT_PANEL_LAYOUT,
  resolveBottomDrag,
  sanitizePanelLayout,
} from './panelLayout';

describe('panel layout', () => {
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

  it('sanitizes stored values', () => {
    expect(sanitizePanelLayout(null)).toEqual(DEFAULT_PANEL_LAYOUT);
    // Older saves also stored the (now removed) order-panel width; it is ignored.
    expect(sanitizePanelLayout({ width: 9999, collapsed: true, bottomHeight: 300 })).toEqual({ bottomHeight: 300, bottomCollapsed: false });
    expect(sanitizePanelLayout({ bottomHeight: 'x', bottomCollapsed: 1 })).toEqual(DEFAULT_PANEL_LAYOUT);
  });
});
