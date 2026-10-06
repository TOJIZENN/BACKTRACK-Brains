// Mirrors the Tailwind theme tokens in index.css (the chart canvas cannot read CSS variables).
export const CHART_COLORS = {
  background: '#0b0e14',
  text: '#7d8799',
  grid: '#161c28',
  border: '#252d3d',
  crosshair: '#4b5568',
  bull: '#26a69a',
  bear: '#ef5350',
  entry: '#9aa4b5',
  stopLoss: '#ef5350',
  takeProfit: '#26a69a',
  equity: '#e3b341',
} as const;
