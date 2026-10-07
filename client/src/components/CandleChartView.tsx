import { useEffect, useRef, type RefObject } from 'react';
import { CandleChart, type ChartMarker, type ChartPriceLine } from '../chart/candleChart';
import type { ChartSettings } from '../chart/chartSettings';
import type { Drawing, DrawingTool } from '../chart/drawings/types';
import type { Candle } from '../types/market';

const INITIAL_VISIBLE_BARS = 150;

interface Props {
  /** Revealed candles only — the replay engine decides what is visible. */
  candles: readonly Candle[];
  pricePrecision: number;
  /** IANA zone for the time axis and crosshair */
  timeZone: string;
  barSeconds: number;
  settings: ChartSettings;
  priceLines?: readonly ChartPriceLine[];
  markers?: readonly ChartMarker[];
  /** Change this value to re-center the chart on the latest candle (e.g. on a new session/reset). */
  focusKey?: string | number;
  tool: DrawingTool;
  drawings: readonly Drawing[];
  onToolChange: (tool: DrawingTool) => void;
  onDrawingsChange: (drawings: Drawing[]) => void;
  onSelectionChange: (id: string | null) => void;
  /** Receives the imperative chart (for drawing style / delete / clear actions). */
  chartRef?: RefObject<CandleChart | null>;
}

export function CandleChartView(props: Props) {
  const { candles, pricePrecision, timeZone, barSeconds, settings, priceLines = [], markers = [], focusKey, tool, drawings, chartRef } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<CandleChart | null>(null);
  // Latest callbacks/settings without recreating the chart when they change identity.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = new CandleChart(containerRef.current, {
      pricePrecision,
      timeZone,
      barSeconds,
      settings: latest.current.settings,
      drawingCallbacks: {
        onDrawingsChange: (d) => latest.current.onDrawingsChange(d),
        onSelectionChange: (id) => latest.current.onSelectionChange(id),
        onToolChange: (t) => latest.current.onToolChange(t),
      },
    });
    instanceRef.current = chart;
    if (chartRef) chartRef.current = chart;
    // A (re)created chart starts empty: push everything the effects below would otherwise only send on change.
    const p = latest.current;
    chart.setCandles(p.candles);
    chart.setPriceLines(p.priceLines ?? []);
    chart.setMarkers(p.markers ?? []);
    chart.setDrawingTool(p.tool);
    chart.setDrawings(p.drawings);
    chart.focusLatest(INITIAL_VISIBLE_BARS);
    return () => {
      chart.destroy();
      instanceRef.current = null;
      if (chartRef) chartRef.current = null;
    };
    // barSeconds is applied by its own effect: a timeframe change must not rebuild the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricePrecision, timeZone, chartRef]);

  useEffect(() => instanceRef.current?.applySettings(settings), [settings]);
  useEffect(() => instanceRef.current?.setBarSeconds(barSeconds), [barSeconds]);
  useEffect(() => instanceRef.current?.setCandles(candles), [candles]);
  useEffect(() => instanceRef.current?.focusLatest(INITIAL_VISIBLE_BARS), [focusKey]);
  useEffect(() => instanceRef.current?.setPriceLines(priceLines), [priceLines]);
  useEffect(() => instanceRef.current?.setMarkers(markers), [markers]);
  useEffect(() => instanceRef.current?.setDrawingTool(tool), [tool]);
  useEffect(() => instanceRef.current?.setDrawings(drawings), [drawings]);

  return <div ref={containerRef} className="h-full w-full" data-testid="candle-chart" />;
}
