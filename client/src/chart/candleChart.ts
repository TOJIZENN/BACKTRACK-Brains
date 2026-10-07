import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../types/market';
import { CHART_COLORS } from './theme';
import { timeZoneOffsetMs } from '../utils/timezone';
import { DEFAULT_CHART_SETTINGS, type ChartSettings } from './chartSettings';
import { DrawingController, type DrawingCallbacks } from './drawings/drawingController';
import { DrawingLayer } from './drawings/drawingLayer';
import type { Drawing, DrawingTool } from './drawings/types';

export interface ChartPriceLine {
  id: string;
  price: number;
  color: string;
  title: string;
  dashed?: boolean;
}

export interface CandleChartOptions {
  pricePrecision: number;
  /** Display zone; see the constructor note. */
  timeZone: string;
  /** Bar duration, used to place drawings in the future area beyond the last candle. */
  barSeconds: number;
  settings?: ChartSettings;
  drawingCallbacks: DrawingCallbacks;
}

export interface ChartMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  color: string;
  text: string;
}

/**
 * Imperative wrapper around Lightweight Charts. It only ever receives already-revealed candles;
 * it has no knowledge of the replay dataset.
 */
export class CandleChart {
  readonly #chart: IChartApi;
  readonly #series: ISeriesApi<'Candlestick'>;
  readonly #markers: ISeriesMarkersPluginApi<Time>;
  #priceLines: IPriceLine[] = [];
  #lastTime: number | null = null;
  #count = 0;
  readonly #timeZone: string;
  readonly #drawingLayer: DrawingLayer;
  readonly #drawings: DrawingController;

  /**
   * Display zone: Lightweight Charts formats timestamps as UTC, so bar times are shifted by the
   * zone's offset (per bar, so daylight saving is respected) — display only. Drawings are anchored
   * to the real UTC bar times and are unaffected.
   */
  constructor(container: HTMLElement, { pricePrecision, timeZone, barSeconds, settings, drawingCallbacks }: CandleChartOptions) {
    this.#timeZone = timeZone;
    this.#chart = createChart(container, {
      autoSize: true,
      // Explicit locale: navigator.language can be a tag Intl rejects (e.g. "en-US@posix").
      localization: { locale: 'en-US' },
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.text,
        fontSize: 12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CHART_COLORS.crosshair, labelBackgroundColor: CHART_COLORS.crosshairLabel },
        horzLine: { color: CHART_COLORS.crosshair, labelBackgroundColor: CHART_COLORS.crosshairLabel },
      },
      rightPriceScale: { borderColor: CHART_COLORS.border },
      timeScale: { borderColor: CHART_COLORS.border, timeVisible: true, secondsVisible: false, rightOffset: 8 },
    });

    this.#series = this.#chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.bull,
      downColor: CHART_COLORS.bear,
      borderVisible: false,
      wickUpColor: CHART_COLORS.bull,
      wickDownColor: CHART_COLORS.bear,
      priceFormat: { type: 'price', precision: pricePrecision, minMove: 1 / 10 ** pricePrecision },
    });
    this.#markers = createSeriesMarkers(this.#series, []);
    this.#drawingLayer = new DrawingLayer(this.#chart, this.#series, barSeconds, pricePrecision);
    this.#series.attachPrimitive(this.#drawingLayer);
    this.#drawings = new DrawingController(container, this.#drawingLayer, drawingCallbacks);
    this.applySettings(settings ?? DEFAULT_CHART_SETTINGS);
  }

  /** Applies canvas and candle colours (TradingView-style chart settings). */
  applySettings(s: ChartSettings): void {
    this.#chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: s.background }, textColor: s.scaleTextColor },
      grid: {
        vertLines: { visible: s.gridVisible, color: s.gridColor },
        horzLines: { visible: s.gridVisible, color: s.gridColor },
      },
      crosshair: { vertLine: { color: s.crosshairColor }, horzLine: { color: s.crosshairColor } },
    });
    this.#series.applyOptions({
      upColor: s.upColor,
      downColor: s.downColor,
      borderVisible: s.borderVisible,
      borderUpColor: s.borderUpColor,
      borderDownColor: s.borderDownColor,
      wickVisible: s.wickVisible,
      wickUpColor: s.wickUpColor,
      wickDownColor: s.wickDownColor,
    });
    this.#drawingLayer.setHandleFill(s.background);
  }

  // ---- drawings ----
  setDrawingTool(tool: DrawingTool): void {
    this.#drawings.setTool(tool);
  }
  setDrawings(drawings: readonly Drawing[]): void {
    this.#drawings.setDrawings(drawings);
  }
  setDrawingStyle(style: { color?: string; width?: number }): void {
    this.#drawings.setStyle(style);
  }
  deleteSelectedDrawing(): void {
    this.#drawings.deleteSelected();
  }
  clearDrawings(): void {
    this.#drawings.clearAll();
  }

  /**
   * Renders the revealed candles. Appending exactly one candle uses an incremental update so the
   * user's zoom/pan is preserved during playback; anything else (step back, reset) redraws.
   */
  setCandles(candles: readonly Candle[]): void {
    const last = candles[candles.length - 1];
    const isSingleAppend =
      last !== undefined && candles.length === this.#count + 1 && this.#lastTime !== null && last.time > this.#lastTime;

    if (isSingleAppend) {
      this.#series.update(this.#toBar(last));
    } else {
      this.#series.setData(candles.map((c) => this.#toBar(c)));
    }
    this.#count = candles.length;
    this.#lastTime = last?.time ?? null;
    this.#drawingLayer.setBars(candles);
  }

  setPriceLines(lines: readonly ChartPriceLine[]): void {
    for (const line of this.#priceLines) this.#series.removePriceLine(line);
    this.#priceLines = lines.map((line) =>
      this.#series.createPriceLine({
        price: line.price,
        color: line.color,
        title: line.title,
        lineWidth: 1,
        lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true,
      }),
    );
  }

  setMarkers(markers: readonly ChartMarker[]): void {
    const sorted: SeriesMarker<Time>[] = [...markers]
      .sort((a, b) => a.time - b.time)
      .map((m) => ({ ...m, time: this.#displayTime(m.time) }));
    this.#markers.setMarkers(sorted);
  }

  /** Shows roughly the last `bars` candles, keeping the latest candle near the right edge. */
  focusLatest(bars: number): void {
    if (this.#count === 0) return;
    this.#chart.timeScale().setVisibleLogicalRange({ from: this.#count - bars, to: this.#count + 8 });
  }

  destroy(): void {
    this.#drawings.destroy();
    this.#chart.remove();
  }

  #displayTime(utcSeconds: number): UTCTimestamp {
    return (utcSeconds + timeZoneOffsetMs(utcSeconds * 1000, this.#timeZone) / 1000) as UTCTimestamp;
  }

  #toBar(c: Candle) {
    return { time: this.#displayTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close };
  }
}
