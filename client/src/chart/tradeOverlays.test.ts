import { describe, expect, it } from 'vitest';
import type { Trade } from '../trading/types';
import { tradeMarkers } from './tradeOverlays';

const trade = (over: Partial<Trade>): Trade => ({
  id: 't1', number: 1, side: 'LONG', entryType: 'MARKET', entryPrice: 100, entryTime: '', entryCandleTime: 0,
  quantity: 1, stopLoss: 95, takeProfit: 110, riskAmount: 5, riskRewardRatio: 2, status: 'OPEN',
  exitPrice: null, exitTime: null, exitCandleTime: null, pnl: null, rMultiple: null, exitReason: null, ambiguousExit: false,
  ...over,
});

describe('tradeMarkers', () => {
  const H1 = 3600;
  const h1Bars = [0, 3600, 7200].map((time) => ({ time }));

  it('snaps lower-timeframe entries/exits to the containing higher-timeframe bar', () => {
    const t = trade({ entryCandleTime: 3600 + 1800, status: 'CLOSED', exitCandleTime: 7200 + 300, pnl: 10, rMultiple: 2 });
    const markers = tradeMarkers([t], h1Bars, H1);
    expect(markers.map((m) => m.time)).toEqual([3600, 7200]);
  });

  it('hides events after the current bar (stepping back in review)', () => {
    const t = trade({ entryCandleTime: 3600 + 1800, status: 'CLOSED', exitCandleTime: 7200 + 300, pnl: 10, rMultiple: 2 });
    expect(tradeMarkers([t], h1Bars.slice(0, 2), H1).map((m) => m.time)).toEqual([3600]);
    expect(tradeMarkers([t], h1Bars.slice(0, 1), H1)).toEqual([]);
  });
});
