import type { Granularity } from './market';
import type { SameCandleRule } from '../trading/types';

export interface SessionSetup {
  instrument: string;
  granularity: Granularity;
  /** Replay start as ms epoch (UTC) */
  startMs: number;
  /** IANA zone used to display and enter times (default Asia/Kolkata). Internals stay in UTC. */
  timeZone: string;
  startingBalance: number;
  riskPercent: number;
  sameCandleRule: SameCandleRule;
}
