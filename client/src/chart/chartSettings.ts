/**
 * User-adjustable chart appearance, modelled on TradingView's "Chart settings":
 * Symbol (candle body / border / wick per direction) and Canvas (background, grid, crosshair, scales).
 * Persisted per browser; only valid #rrggbb colours are accepted back from storage.
 */

export interface ChartSettings {
  // Symbol
  upColor: string;
  downColor: string;
  borderVisible: boolean;
  borderUpColor: string;
  borderDownColor: string;
  wickVisible: boolean;
  wickUpColor: string;
  wickDownColor: string;
  // Canvas
  background: string;
  gridVisible: boolean;
  gridColor: string;
  crosshairColor: string;
  scaleTextColor: string;
}

/** TradingView dark defaults. */
export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  upColor: '#089981',
  downColor: '#f23645',
  borderVisible: true,
  borderUpColor: '#089981',
  borderDownColor: '#f23645',
  wickVisible: true,
  wickUpColor: '#089981',
  wickDownColor: '#f23645',
  background: '#131722',
  gridVisible: true,
  gridColor: '#1f2330',
  crosshairColor: '#758696',
  scaleTextColor: '#b2b5be',
};

export interface ChartPreset {
  id: string;
  label: string;
  settings: ChartSettings;
}

export const CHART_PRESETS: ChartPreset[] = [
  { id: 'tv-dark', label: 'TradingView dark', settings: DEFAULT_CHART_SETTINGS },
  {
    id: 'tv-light',
    label: 'TradingView light',
    settings: { ...DEFAULT_CHART_SETTINGS, background: '#ffffff', gridColor: '#f0f3fa', crosshairColor: '#9598a1', scaleTextColor: '#131722' },
  },
  {
    id: 'classic',
    label: 'Classic (green/red)',
    settings: {
      ...DEFAULT_CHART_SETTINGS,
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    },
  },
  {
    id: 'hollow-mono',
    label: 'Monochrome',
    settings: {
      ...DEFAULT_CHART_SETTINGS,
      upColor: '#d1d4dc',
      downColor: '#131722',
      borderUpColor: '#d1d4dc',
      borderDownColor: '#d1d4dc',
      wickUpColor: '#d1d4dc',
      wickDownColor: '#d1d4dc',
    },
  },
];

const STORAGE_KEY = 'backtrack.chartSettings.v1';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Merges untrusted input over the defaults, keeping only well-formed values. */
export function sanitizeChartSettings(input: unknown): ChartSettings {
  const result: ChartSettings = { ...DEFAULT_CHART_SETTINGS };
  if (typeof input !== 'object' || input === null) return result;
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_CHART_SETTINGS) as (keyof ChartSettings)[]) {
    const value = record[key];
    const fallback = DEFAULT_CHART_SETTINGS[key];
    if (typeof fallback === 'boolean' && typeof value === 'boolean') (result[key] as boolean) = value;
    if (typeof fallback === 'string' && typeof value === 'string' && HEX_COLOR.test(value)) (result[key] as string) = value.toLowerCase();
  }
  return result;
}

export function loadChartSettings(): ChartSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return sanitizeChartSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_CHART_SETTINGS };
  }
}

export function saveChartSettings(settings: ChartSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable — settings simply won't persist.
  }
}
