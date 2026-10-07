import { describe, expect, it } from 'vitest';
import { DEFAULT_CHART_SETTINGS, migrateLegacyCanvas, sanitizeChartSettings } from './chartSettings';

describe('sanitizeChartSettings', () => {
  it('returns defaults for missing or malformed input', () => {
    expect(sanitizeChartSettings(null)).toEqual(DEFAULT_CHART_SETTINGS);
    expect(sanitizeChartSettings('nope')).toEqual(DEFAULT_CHART_SETTINGS);
  });

  it('keeps valid colours and booleans, rejects everything else', () => {
    const result = sanitizeChartSettings({
      background: '#FFFFFF',
      upColor: 'red',
      gridColor: 'url(javascript:alert(1))',
      wickVisible: false,
      borderVisible: 'no',
      extra: '#123456',
    });
    expect(result.background).toBe('#ffffff');
    expect(result.upColor).toBe(DEFAULT_CHART_SETTINGS.upColor);
    expect(result.gridColor).toBe(DEFAULT_CHART_SETTINGS.gridColor);
    expect(result.wickVisible).toBe(false);
    expect(result.borderVisible).toBe(true);
    expect(result).not.toHaveProperty('extra');
  });
});

describe('migrateLegacyCanvas', () => {
  const navy = { ...DEFAULT_CHART_SETTINGS, background: '#131722', gridColor: '#1f2330', crosshairColor: '#758696', scaleTextColor: '#b2b5be' };

  it('moves the old navy canvas to the black defaults', () => {
    expect(migrateLegacyCanvas(navy)).toEqual(DEFAULT_CHART_SETTINGS);
  });

  it('keeps colors the user customized', () => {
    const custom = { ...navy, gridColor: '#ff0000', upColor: '#00ff00' };
    const migrated = migrateLegacyCanvas(custom);
    expect(migrated.background).toBe('#000000');
    expect(migrated.gridColor).toBe('#ff0000');
    expect(migrated.upColor).toBe('#00ff00');
  });

  it('leaves a custom background untouched', () => {
    const light = { ...navy, background: '#ffffff' };
    expect(migrateLegacyCanvas(light)).toBe(light);
  });
});
