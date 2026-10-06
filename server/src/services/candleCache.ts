import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Candle, Granularity } from '../types/candle.js';

/** Per-day candle storage. Swap this for a database-backed implementation later. */
export interface CandleCache {
  readDay(instrument: string, granularity: Granularity, dayKey: string): Promise<Candle[] | null>;
  writeDay(instrument: string, granularity: Granularity, dayKey: string, candles: Candle[]): Promise<void>;
}

/** cache/XAU_USD/M5/2026-01-15.json */
export function createFileCandleCache(rootDir: string): CandleCache {
  const fileFor = (instrument: string, granularity: Granularity, dayKey: string) =>
    path.join(rootDir, instrument, granularity, `${dayKey}.json`);

  return {
    async readDay(instrument, granularity, dayKey) {
      try {
        const raw = await fs.readFile(fileFor(instrument, granularity, dayKey), 'utf8');
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as Candle[]) : null;
      } catch {
        // Missing or corrupt cache files are simply refetched.
        return null;
      }
    },
    async writeDay(instrument, granularity, dayKey, candles) {
      const file = fileFor(instrument, granularity, dayKey);
      await fs.mkdir(path.dirname(file), { recursive: true });
      // Write-then-rename so a crash never leaves a half-written file behind.
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(candles));
      await fs.rename(tmp, file);
    },
  };
}
