import { useEffect, useState } from 'react';
import {
  CHART_MIN_RESERVED_HEIGHT,
  clampPanelWidth,
  loadPanelLayout,
  resolveBottomDrag,
  savePanelLayout,
  type PanelLayout,
} from '../utils/panelLayout';

/** Order-panel and bottom-dashboard sizes, persisted in this browser. */
export function usePanelLayout() {
  const [layout, setLayout] = useState<PanelLayout>(loadPanelLayout);
  useEffect(() => savePanelLayout(layout), [layout]);
  return {
    layout,
    setWidth: (width: number) => setLayout((prev) => ({ ...prev, width: clampPanelWidth(width) })),
    toggleCollapsed: () => setLayout((prev) => ({ ...prev, collapsed: !prev.collapsed })),
    /** Bottom dashboard dragged to `height` px; never squeezes the chart below its reserved height. */
    setBottomHeight: (height: number) =>
      setLayout((prev) => resolveBottomDrag(prev, height, window.innerHeight - CHART_MIN_RESERVED_HEIGHT)),
    toggleBottomCollapsed: () => setLayout((prev) => ({ ...prev, bottomCollapsed: !prev.bottomCollapsed })),
  };
}
