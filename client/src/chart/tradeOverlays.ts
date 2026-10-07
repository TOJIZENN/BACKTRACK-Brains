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

/** Open time of the visible bar containing `time` (bars may be another timeframe than the trade's). */
function containingBar(time: number, bars: readonly { time: number }[]): number | null {
  let lo = 0;
  let hi = bars.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= time) {
      found = bars[mid].time;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Entry and exit markers, snapped to the visible bars (trades may come from another timeframe).
 * Only markers at or before the current bar are returned, so stepping back in the replay never shows
 * an exit that has not "happened" yet on screen.
 */
export function tradeMarkers(trades: readonly Trade[], bars: readonly { time: number }[], barSeconds: number): ChartMarker[] {
  const markers: ChartMarker[] = [];
  const last = bars.at(-1);
  if (!last) return markers;
  // Anything before the end of the current bar has happened (covers lower-timeframe events inside it).
  const happened = (time: number) => time < last.time + barSeconds;
  for (const t of trades) {
    const entryBar = containingBar(t.entryCandleTime, bars);
    if (entryBar !== null && happened(t.entryCandleTime)) {
      const isLong = t.side === 'LONG';
      markers.push({
        time: entryBar,
        position: isLong ? 'belowBar' : 'aboveBar',
        shape: isLong ? 'arrowUp' : 'arrowDown',
        color: isLong ? CHART_COLORS.bull : CHART_COLORS.bear,
        text: `#${t.number}`,
      });
    }
    const exitBar = t.exitCandleTime === null ? null : containingBar(t.exitCandleTime, bars);
    if (t.status === 'CLOSED' && exitBar !== null && happened(t.exitCandleTime!)) {
      const won = (t.pnl ?? 0) > 0;
      markers.push({
        time: exitBar,
        position: t.side === 'LONG' ? 'aboveBar' : 'belowBar',
        shape: 'circle',
        color: won ? CHART_COLORS.bull : CHART_COLORS.bear,
        text: formatR(t.rMultiple ?? 0),
      });
    }
  }
  return markers;
}
