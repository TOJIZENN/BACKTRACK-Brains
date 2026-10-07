import { describe, expect, it } from 'vitest';
import { clampPanelWidth, DEFAULT_PANEL_LAYOUT, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH, sanitizePanelLayout } from './panelLayout';

describe('panel layout', () => {
  it('clamps the width to the allowed range', () => {
    expect(clampPanelWidth(100)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(5000)).toBe(PANEL_MAX_WIDTH);
    expect(clampPanelWidth(400.6)).toBe(401);
    expect(clampPanelWidth(Number.NaN)).toBe(DEFAULT_PANEL_LAYOUT.width);
  });

  it('sanitizes stored values', () => {
    expect(sanitizePanelLayout(null)).toEqual(DEFAULT_PANEL_LAYOUT);
    expect(sanitizePanelLayout({ width: 9999, collapsed: true })).toEqual({ width: PANEL_MAX_WIDTH, collapsed: true });
    expect(sanitizePanelLayout({ width: '300', collapsed: 'yes' })).toEqual(DEFAULT_PANEL_LAYOUT);
  });
});
