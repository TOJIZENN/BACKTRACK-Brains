import { DRAWING_COLORS, DRAWING_WIDTHS, type Drawing } from '../chart/drawings/types';

interface Props {
  drawing: Drawing;
  onStyle: (style: { color?: string; width?: number }) => void;
  onDelete: () => void;
}

/** Floating style bar for the selected drawing (colour, line width, delete). */
export function DrawingStyleBar({ drawing, onStyle, onDelete }: Props) {
  return (
    <div
      className="absolute left-1/2 top-2 z-20 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-md border border-terminal-strong bg-terminal-panel px-2 py-1 shadow-lg"
      data-testid="drawing-style-bar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {DRAWING_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Colour ${color}`}
          onClick={() => onStyle({ color })}
          className={`h-5 w-5 rounded-sm border ${drawing.color === color ? 'border-white' : 'border-transparent'}`}
          style={{ backgroundColor: color }}
        />
      ))}
      <label className="relative ml-1 h-5 w-5 cursor-pointer overflow-hidden rounded-sm border border-terminal-strong" title="Custom colour">
        <span className="absolute inset-0" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />
        <input
          type="color"
          aria-label="Custom colour"
          value={drawing.color}
          onChange={(e) => onStyle({ color: e.target.value })}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <div className="mx-1 h-5 w-px bg-terminal-border" />
      {DRAWING_WIDTHS.map((width) => (
        <button
          key={width}
          type="button"
          aria-label={`Line width ${width}px`}
          aria-pressed={drawing.width === width}
          onClick={() => onStyle({ width })}
          className={`flex h-6 w-7 items-center justify-center rounded ${drawing.width === width ? 'bg-terminal-raised' : 'hover:bg-terminal-raised'}`}
        >
          <span className="block w-4 rounded bg-terminal-text" style={{ height: width }} />
        </button>
      ))}
      <div className="mx-1 h-5 w-px bg-terminal-border" />
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete drawing"
        title="Delete (Del)"
        className="rounded px-1.5 py-0.5 text-xs text-terminal-text/80 hover:bg-bear/20 hover:text-bear"
      >
        Delete
      </button>
    </div>
  );
}
