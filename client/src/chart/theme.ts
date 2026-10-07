// Black theme. Mirrors the Tailwind tokens in index.css (the chart canvas cannot read CSS variables).
export const CHART_COLORS = {
  background: '#000000',
  text: '#b3b3b3',
  grid: 'rgba(38, 38, 38, 0.6)',
  border: '#242424',
  crosshair: '#7a7a7a',
  crosshairLabel: '#2e2e2e',
  bull: '#089981',
  bear: '#f23645',
  entry: '#8c8c8c',
  stopLoss: '#f23645',
  takeProfit: '#089981',
  equity: '#2962ff',
} as const;
