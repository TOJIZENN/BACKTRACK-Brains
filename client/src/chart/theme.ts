// TradingView dark theme. Mirrors the Tailwind tokens in index.css (the chart canvas cannot read CSS variables).
export const CHART_COLORS = {
  background: '#131722',
  text: '#b2b5be',
  grid: 'rgba(42, 46, 57, 0.6)',
  border: '#2a2e39',
  crosshair: '#758696',
  crosshairLabel: '#363a45',
  bull: '#089981',
  bear: '#f23645',
  entry: '#787b86',
  stopLoss: '#f23645',
  takeProfit: '#089981',
  equity: '#2962ff',
} as const;
