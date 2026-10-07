import type { ReactNode } from 'react';
import { DRAWING_TOOLS, type DrawingTool } from '../chart/drawings/types';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const dot = (cx: number, cy: number) => <circle cx={cx} cy={cy} r={1.8} fill="currentColor" stroke="none" />;

const ICONS: Record<DrawingTool | 'trash', ReactNode> = {
  cursor: <path d="M6 4l11 7-5 1.2L9.6 18z" {...S} />,
  trendline: (
    <>
      <path d="M5 19L19 5" {...S} />
      {dot(5, 19)}
      {dot(19, 5)}
    </>
  ),
  ray: (
    <>
      <path d="M5 17L21 7" {...S} />
      {dot(5, 17)}
      {dot(12, 12.6)}
    </>
  ),
  hline: (
    <>
      <path d="M3 12h18" {...S} />
      {dot(12, 12)}
    </>
  ),
  vline: (
    <>
      <path d="M12 3v18" {...S} />
      {dot(12, 12)}
    </>
  ),
  rectangle: <rect x="4.5" y="6.5" width="15" height="11" {...S} />,
  path: (
    <>
      <path d="M3.5 18L9 9l5 5 6.5-9" {...S} />
      {dot(3.5, 18)}
      {dot(9, 9)}
      {dot(14, 14)}
      {dot(20.5, 5)}
    </>
  ),
  fib: (
    <>
      <path d="M4 5h16M4 10h16M4 14h16M4 19h16" {...S} strokeWidth={1.3} />
      <path d="M5 19L19 5" {...S} strokeDasharray="2 2" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" {...S} />,
};

interface Props {
  tool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  onClearAll: () => void;
  hasDrawings: boolean;
}

/** TradingView-style vertical drawing toolbar on the left of the chart. */
export function DrawingToolbar({ tool, onToolChange, onClearAll, hasDrawings }: Props) {
  return (
    <nav
      className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-terminal-border bg-terminal-panel py-2"
      aria-label="Drawing tools"
    >
      {DRAWING_TOOLS.map(({ tool: t, label, hint }) => (
        <button
          key={t}
          type="button"
          onClick={() => onToolChange(t)}
          title={`${label} — ${hint}`}
          aria-label={label}
          aria-pressed={tool === t}
          className={`flex h-8 w-8 items-center justify-center rounded transition ${tool === t ? 'bg-accent/20 text-accent' : 'text-terminal-text/80 hover:bg-terminal-raised hover:text-terminal-text'}`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            {ICONS[t]}
          </svg>
        </button>
      ))}
      <div className="my-1 h-px w-6 bg-terminal-border" />
      <button
        type="button"
        onClick={onClearAll}
        disabled={!hasDrawings}
        title="Remove all drawings"
        aria-label="Remove all drawings"
        className="flex h-8 w-8 items-center justify-center rounded text-terminal-text/80 transition hover:bg-terminal-raised hover:text-bear disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          {ICONS.trash}
        </svg>
      </button>
    </nav>
  );
}
