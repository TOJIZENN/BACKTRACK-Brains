import type { Granularity } from './market';
import type { SameCandleRule } from '../trading/types';

export interface SessionSetup {
  instrument: string;
  granularity: Granularity;
  /** Where this session's data starts replaying, ms epoch (UTC). Moves with timeframe switches. */
  startMs: number;
  /** Original start of the run; Reset returns here even after timeframe switches. */
  runStartMs: number;
  /** IANA zone used to display and enter times (default Asia/Kolkata). Internals stay in UTC. */
  timeZone: string;
  startingBalance: number;
  riskPercent: number;
  sameCandleRule: SameCandleRule;
}
