import { useEffect, useState } from 'react';
import { clampPanelWidth, loadPanelLayout, savePanelLayout, type PanelLayout } from '../utils/panelLayout';

/** Order-panel width/collapsed state, persisted in this browser. */
export function usePanelLayout() {
  const [layout, setLayout] = useState<PanelLayout>(loadPanelLayout);
  useEffect(() => savePanelLayout(layout), [layout]);
  return {
    layout,
    setWidth: (width: number) => setLayout((prev) => ({ ...prev, width: clampPanelWidth(width) })),
    toggleCollapsed: () => setLayout((prev) => ({ ...prev, collapsed: !prev.collapsed })),
  };
}
