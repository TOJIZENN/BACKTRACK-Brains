import { useEffect, useState } from 'react'
import { CandleChartView } from './components/CandleChartView'
import { fetchCandles } from './services/candles'
import type { Candle } from './types/market'

// Temporary Phase 3 harness: renders two days of M5 data.
export default function App() {
  const [candles, setCandles] = useState<Candle[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    fetchCandles('XAU_USD', 'M5', Date.parse('2026-09-14T00:00:00Z'), Date.parse('2026-09-16T00:00:00Z'))
      .then(setCandles)
      .catch((e: Error) => setError(e.message))
  }, [])
  return (
    <div className="flex h-full flex-col">
      <div className="p-2 text-sm">{error || `${candles.length} candles`}</div>
      <div className="flex-1"><CandleChartView candles={candles} pricePrecision={3} focusKey={candles.length} /></div>
    </div>
  )
}
