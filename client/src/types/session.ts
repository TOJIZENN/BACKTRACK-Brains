import type { Granularity } from './market';
import type { SameCandleRule } from '../trading/types';

export interface SessionSetup {
  instrument: string;
  granularity: Granularity;
  /** Replay start as ms epoch (UTC) */
  startMs: number;
  startingBalance: number;
  riskPercent: number;
  sameCandleRule: SameCandleRule;
}
