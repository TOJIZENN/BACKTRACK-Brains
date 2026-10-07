import { useEffect, useState } from 'react';
import { loadChartSettings, saveChartSettings, type ChartSettings } from '../chart/chartSettings';

/** Chart appearance, persisted in this browser. */
export function useChartSettings() {
  const [settings, setSettings] = useState<ChartSettings>(loadChartSettings);
  useEffect(() => saveChartSettings(settings), [settings]);
  return [settings, setSettings] as const;
}
