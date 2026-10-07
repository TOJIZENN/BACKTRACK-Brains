import type { Granularity } from './market';
import type { SameCandleRule } from '../trading/types';
import type { ProviderId } from './providers';

export interface SessionSetup {
  instrument: string;
  /** Market-data source chosen in the UI */
  provider: ProviderId;
  /** Initial chart timeframe (the replay itself runs on 1-minute data and can switch any time) */
  granularity: Granularity;
  /** Replay start as ms epoch (UTC) */
  startMs: number;
  /** IANA zone used to display and enter times (default Asia/Kolkata). Internals stay in UTC. */
  timeZone: string;
  startingBalance: number;
  riskPercent: number;
  sameCandleRule: SameCandleRule;
}
