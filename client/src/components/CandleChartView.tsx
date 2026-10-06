import { useEffect, useRef } from 'react';
import { CandleChart, type ChartMarker, type ChartPriceLine } from '../chart/candleChart';
import type { Candle } from '../types/market';

const INITIAL_VISIBLE_BARS = 150;

interface Props {
  /** Revealed candles only — the replay engine decides what is visible. */
  candles: readonly Candle[];
  pricePrecision: number;
  priceLines?: readonly ChartPriceLine[];
  markers?: readonly ChartMarker[];
  /** Change this value to re-center the chart on the latest candle (e.g. on a new session/reset). */
  focusKey?: string | number;
}

export function CandleChartView({ candles, pricePrecision, priceLines = [], markers = [], focusKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<CandleChart | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = new CandleChart(containerRef.current, pricePrecision);
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [pricePrecision]);

  useEffect(() => {
    chartRef.current?.setCandles(candles);
  }, [candles]);

  useEffect(() => {
    chartRef.current?.focusLatest(INITIAL_VISIBLE_BARS);
  }, [focusKey]);

  useEffect(() => {
    chartRef.current?.setPriceLines(priceLines);
  }, [priceLines]);

  useEffect(() => {
    chartRef.current?.setMarkers(markers);
  }, [markers]);

  return <div ref={containerRef} className="h-full w-full" data-testid="candle-chart" />;
}
