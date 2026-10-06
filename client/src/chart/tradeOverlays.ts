import type { Trade } from '../trading/types';
import type { ChartMarker, ChartPriceLine } from './candleChart';
import { CHART_COLORS } from './theme';
import { formatR } from '../utils/format';

/** Entry / SL / TP lines for each open trade. */
export function openTradeLines(trades: readonly Trade[]): ChartPriceLine[] {
  return trades
    .filter((t) => t.status === 'OPEN')
    .flatMap((t) => [
      { id: `${t.id}-entry`, price: t.entryPrice, color: CHART_COLORS.entry, title: `#${t.number} ${t.side === 'LONG' ? 'BUY' : 'SELL'}` },
      { id: `${t.id}-sl`, price: t.stopLoss, color: CHART_COLORS.stopLoss, title: `#${t.number} SL` },
      { id: `${t.id}-tp`, price: t.takeProfit, color: CHART_COLORS.takeProfit, title: `#${t.number} TP` },
    ]);
}

/** Dashed preview lines for the SL/TP currently typed into the order ticket. */
export function draftLines(stopLoss: number, takeProfit: number): ChartPriceLine[] {
  const lines: ChartPriceLine[] = [];
  if (Number.isFinite(stopLoss) && stopLoss > 0) {
    lines.push({ id: 'draft-sl', price: stopLoss, color: CHART_COLORS.stopLoss, title: 'SL', dashed: true });
  }
  if (Number.isFinite(takeProfit) && takeProfit > 0) {
    lines.push({ id: 'draft-tp', price: takeProfit, color: CHART_COLORS.takeProfit, title: 'TP', dashed: true });
  }
  return lines;
}

/**
 * Entry and exit markers. Only markers at or before `maxTime` are returned, so stepping back
 * in the replay never shows an exit that has not "happened" yet on screen.
 */
export function tradeMarkers(trades: readonly Trade[], maxTime: number): ChartMarker[] {
  const markers: ChartMarker[] = [];
  for (const t of trades) {
    if (t.entryCandleTime <= maxTime) {
      const isLong = t.side === 'LONG';
      markers.push({
        time: t.entryCandleTime,
        position: isLong ? 'belowBar' : 'aboveBar',
        shape: isLong ? 'arrowUp' : 'arrowDown',
        color: isLong ? CHART_COLORS.bull : CHART_COLORS.bear,
        text: `#${t.number}`,
      });
    }
    if (t.status === 'CLOSED' && t.exitCandleTime !== null && t.exitCandleTime <= maxTime) {
      const won = (t.pnl ?? 0) > 0;
      markers.push({
        time: t.exitCandleTime,
        position: t.side === 'LONG' ? 'aboveBar' : 'belowBar',
        shape: 'circle',
        color: won ? CHART_COLORS.bull : CHART_COLORS.bear,
        text: formatR(t.rMultiple ?? 0),
      });
    }
  }
  return markers;
}
