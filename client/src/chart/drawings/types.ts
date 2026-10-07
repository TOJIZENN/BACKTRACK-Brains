export type DrawingTool = 'cursor' | 'trendline' | 'ray' | 'hline' | 'vline' | 'rectangle' | 'path' | 'fib';
export type DrawingType = Exclude<DrawingTool, 'cursor'>;

/** A chart anchor: UTC candle time (seconds, may lie beyond the last revealed bar) and price. */
export interface AnchorPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: AnchorPoint[];
  color: string;
  /** Line width in CSS pixels */
  width: number;
}

/** Number of points each tool needs; `null` = open-ended (path: finish with double-click / Enter). */
export const POINTS_REQUIRED: Record<DrawingType, number | null> = {
  trendline: 2,
  ray: 2,
  hline: 1,
  vline: 1,
  rectangle: 2,
  path: null,
  fib: 2,
};

export const DRAWING_TOOLS: { tool: DrawingTool; label: string; hint: string }[] = [
  { tool: 'cursor', label: 'Cursor', hint: 'Select, move and edit drawings' },
  { tool: 'trendline', label: 'Trend line', hint: 'Click two points' },
  { tool: 'ray', label: 'Ray', hint: 'Click two points; extends to the right' },
  { tool: 'hline', label: 'Horizontal line', hint: 'Click once' },
  { tool: 'vline', label: 'Vertical line', hint: 'Click once' },
  { tool: 'rectangle', label: 'Rectangle', hint: 'Click two opposite corners' },
  { tool: 'path', label: 'Path', hint: 'Click to add points; double-click or Enter to finish' },
  { tool: 'fib', label: 'Fib retracement', hint: 'Click the swing start, then the swing end' },
];

/** TradingView drawing palette */
export const DRAWING_COLORS = ['#2962ff', '#f23645', '#089981', '#ff9800', '#9c27b0', '#00bcd4', '#ffeb3b', '#d1d4dc'];
export const DEFAULT_DRAWING_COLOR = '#2962ff';
export const DEFAULT_DRAWING_WIDTH = 2;
export const DRAWING_WIDTHS = [1, 2, 3, 4];

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
