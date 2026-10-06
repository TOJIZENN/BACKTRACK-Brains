import { useState, type MouseEvent } from 'react';
import type { EquityPoint } from '../trading/statistics';
import { CHART_COLORS } from '../chart/theme';
import { useTimeZone } from '../hooks/useTimeZone';
import { formatDateTime, formatMoney } from '../utils/format';

const WIDTH = 360;
const HEIGHT = 170;
const PAD = { top: 10, right: 12, bottom: 18, left: 58 };
const GRID_LINES = 4;

interface Props {
  points: readonly EquityPoint[];
  startingBalance: number;
}

/** Closed-trade balance after each trade. Index-based x-axis keeps same-candle exits distinct. */
export function EquityCurve({ points, startingBalance }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const timeZone = useTimeZone();

  if (points.length < 2) {
    return <p className="flex h-full items-center justify-center text-sm text-terminal-muted">Close a trade to see the equity curve.</p>;
  }

  const balances = points.map((p) => p.balance);
  const rawMin = Math.min(...balances);
  const rawMax = Math.max(...balances);
  const span = rawMax - rawMin || Math.max(1, rawMax * 0.01);
  const min = rawMin - span * 0.1;
  const max = rawMax + span * 0.1;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * innerH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join('');
  const hovered = hover === null ? null : points[hover];

  const onMove = (event: MouseEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    setHover(Math.round(ratio * (points.length - 1)));
  };

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full" role="img" aria-label="Equity curve by closed trade">
        {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
          const value = min + ((max - min) * i) / GRID_LINES;
          return (
            <g key={i}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(value)} y2={y(value)} stroke={CHART_COLORS.grid} strokeWidth={1} />
              <text x={PAD.left - 6} y={y(value)} dy="0.32em" textAnchor="end" fontSize={9} fill={CHART_COLORS.text}>
                {Math.round(value).toLocaleString('en-US')}
              </text>
            </g>
          );
        })}
        {startingBalance >= min && startingBalance <= max && (
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(startingBalance)}
            y2={y(startingBalance)}
            stroke={CHART_COLORS.border}
            strokeDasharray="3 3"
          />
        )}
        <text x={PAD.left} y={HEIGHT - 4} fontSize={9} fill={CHART_COLORS.text}>
          Start
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 4} textAnchor="end" fontSize={9} fill={CHART_COLORS.text}>
          Trade {points.length - 1}
        </text>
        <path d={path} fill="none" stroke={CHART_COLORS.equity} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hovered && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke={CHART_COLORS.crosshair} />
            <circle cx={x(hover)} cy={y(hovered.balance)} r={4} fill={CHART_COLORS.equity} stroke={CHART_COLORS.background} strokeWidth={2} />
          </g>
        )}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 rounded border border-terminal-border bg-terminal-raised px-2 py-1 text-xs shadow"
          style={{ left: `${(x(hover) / WIDTH) * 100}%`, transform: hover > points.length / 2 ? 'translateX(-105%)' : 'translateX(5%)' }}
        >
          <div className="font-mono text-terminal-text">{formatMoney(hovered.balance)}</div>
          <div className="text-terminal-muted">
            {hover === 0 ? 'Starting balance' : `After trade ${hover}`}
            {hovered.time && ` · ${formatDateTime(hovered.time, timeZone)}`}
          </div>
        </div>
      )}
    </div>
  );
}
