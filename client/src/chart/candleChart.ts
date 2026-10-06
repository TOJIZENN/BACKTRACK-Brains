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

export interface ChartPriceLine {
  id: string;
  price: number;
  color: string;
  title: string;
  dashed?: boolean;
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

  constructor(container: HTMLElement, pricePrecision: number) {
    this.#chart = createChart(container, {
      autoSize: true,
      // Explicit locale: navigator.language can be a tag Intl rejects (e.g. "en-US@posix").
      localization: { locale: 'en-US' },
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.text,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CHART_COLORS.crosshair, labelBackgroundColor: CHART_COLORS.border },
        horzLine: { color: CHART_COLORS.crosshair, labelBackgroundColor: CHART_COLORS.border },
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
      this.#series.update(toBar(last));
    } else {
      this.#series.setData(candles.map(toBar));
    }
    this.#count = candles.length;
    this.#lastTime = last?.time ?? null;
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
      .map((m) => ({ ...m, time: m.time as UTCTimestamp }));
    this.#markers.setMarkers(sorted);
  }

  /** Shows roughly the last `bars` candles, keeping the latest candle near the right edge. */
  focusLatest(bars: number): void {
    if (this.#count === 0) return;
    this.#chart.timeScale().setVisibleLogicalRange({ from: this.#count - bars, to: this.#count + 8 });
  }

  destroy(): void {
    this.#chart.remove();
  }
}

function toBar(c: Candle) {
  return { time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close };
}
