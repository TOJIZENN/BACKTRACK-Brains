import { useMemo, useState } from 'react';
import type { ReplaySession } from '../store/replaySession';
import type { OrderPreview } from '../trading/tradingAccount';
import type { TradeSide } from '../trading/types';

export interface OrderTicketValues {
  riskPercent: string;
  stopLoss: string;
  takeProfit: string;
}

/** Order-ticket form state plus live previews for both sides at the current market price. */
export function useOrderTicket(session: ReplaySession) {
  const [values, setValues] = useState<OrderTicketValues>({
    riskPercent: String(session.setup.riskPercent),
    stopLoss: '',
    takeProfit: '',
  });
  const [error, setError] = useState<string | null>(null);

  const order = useMemo(
    () => ({
      riskPercent: Number(values.riskPercent),
      stopLoss: values.stopLoss === '' ? Number.NaN : Number(values.stopLoss),
      takeProfit: values.takeProfit === '' ? Number.NaN : Number(values.takeProfit),
    }),
    [values],
  );

  // Cheap to compute; re-evaluated on every render so it always reflects the latest candle and balance.
  const previews: Record<TradeSide, OrderPreview> = {
    LONG: session.previewOrder({ side: 'LONG', ...order }),
    SHORT: session.previewOrder({ side: 'SHORT', ...order }),
  };

  /** The side implied by where the stop sits relative to the entry. */
  const impliedSide: TradeSide | null =
    Number.isFinite(order.stopLoss) && order.stopLoss !== previews.LONG.entryPrice
      ? order.stopLoss < previews.LONG.entryPrice
        ? 'LONG'
        : 'SHORT'
      : null;

  const update = (key: keyof OrderTicketValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const submit = (side: TradeSide) => {
    const result = session.placeOrder({ side, ...order });
    if (result.ok) {
      setValues((prev) => ({ ...prev, stopLoss: '', takeProfit: '' }));
      setError(null);
    } else {
      setError(result.error);
    }
    return result;
  };

  return { values, update, order, previews, impliedSide, error, setError, submit };
}

export type OrderTicket = ReturnType<typeof useOrderTicket>;
