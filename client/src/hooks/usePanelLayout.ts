import { useEffect, useState } from 'react';
import {
  CHART_MIN_RESERVED_HEIGHT,
  loadPanelLayout,
  resolveBottomDrag,
  savePanelLayout,
  type PanelLayout,
} from '../utils/panelLayout';

/** Bottom-dashboard size, persisted in this browser. */
export function usePanelLayout() {
  const [layout, setLayout] = useState<PanelLayout>(loadPanelLayout);
  useEffect(() => savePanelLayout(layout), [layout]);
  return {
    layout,
    /** Bottom dashboard dragged to `height` px; never squeezes the chart below its reserved height. */
    setBottomHeight: (height: number) =>
      setLayout((prev) => resolveBottomDrag(prev, height, window.innerHeight - CHART_MIN_RESERVED_HEIGHT)),
    toggleBottomCollapsed: () => setLayout((prev) => ({ ...prev, bottomCollapsed: !prev.bottomCollapsed })),
  };
}
