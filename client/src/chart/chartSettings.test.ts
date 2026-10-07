import { describe, expect, it } from 'vitest';
import { DEFAULT_CHART_SETTINGS, sanitizeChartSettings } from './chartSettings';

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
