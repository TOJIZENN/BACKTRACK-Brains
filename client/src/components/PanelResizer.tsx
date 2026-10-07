import type { KeyboardEvent } from 'react';
import { useDragResize } from '../hooks/useDragResize';
import { DEFAULT_PANEL_LAYOUT, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH } from '../utils/panelLayout';

const KEYBOARD_STEP = 16;

interface Props {
  width: number;
  onResize: (width: number) => void;
}

/** Draggable divider between the chart and the right-hand order panel. */
export function PanelResizer({ width, onResize }: Props) {
  // Dragging left by d widens the panel by d: new width = (width at grab + grab x) − pointer x.
  const drag = useDragResize('horizontal', (_handle, x) => width + x, onResize);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Moving the divider left widens the panel.
    if (e.key === 'ArrowLeft') onResize(width + KEYBOARD_STEP);
    else if (e.key === 'ArrowRight') onResize(width - KEYBOARD_STEP);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize order panel"
      aria-valuenow={width}
      aria-valuemin={PANEL_MIN_WIDTH}
      aria-valuemax={PANEL_MAX_WIDTH}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      {...drag}
      onDoubleClick={() => onResize(DEFAULT_PANEL_LAYOUT.width)}
      onKeyDown={onKeyDown}
      className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize outline-none max-lg:hidden"
      data-testid="panel-resizer"
    >
      <div className="mx-auto h-full w-px bg-terminal-border transition group-hover:w-0.5 group-hover:bg-accent group-focus-visible:w-0.5 group-focus-visible:bg-accent" />
    </div>
  );
}
