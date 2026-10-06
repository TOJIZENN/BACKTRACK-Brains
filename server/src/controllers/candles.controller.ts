import type { RequestHandler } from 'express';
import { INSTRUMENTS, MAX_REQUEST_DAYS } from '../config/instruments.js';
import type { CandlesQuery, CandlesService } from '../services/candles.service.js';
import { isGranularity } from '../types/candle.js';
import { badRequest } from '../utils/httpError.js';
import { MS_PER_DAY } from '../utils/time.js';

function parseDate(value: unknown, name: string): number {
  if (typeof value !== 'string' || value.trim() === '') throw badRequest(`Query parameter "${name}" is required (ISO-8601 date-time).`);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw badRequest(`Query parameter "${name}" is not a valid date: "${value}".`);
  return ms;
}

export function parseCandlesQuery(query: Record<string, unknown>, nowMs: number): CandlesQuery {
  const { instrument, granularity } = query;
  if (typeof instrument !== 'string' || !INSTRUMENTS[instrument]) {
    throw badRequest(`Unsupported instrument "${String(instrument)}". Supported: ${Object.keys(INSTRUMENTS).join(', ')}.`);
  }
  if (!isGranularity(granularity) || !INSTRUMENTS[instrument].granularities.includes(granularity)) {
    throw badRequest(
      `Unsupported granularity "${String(granularity)}". Supported: ${INSTRUMENTS[instrument].granularities.join(', ')}.`,
    );
  }
  const fromMs = parseDate(query.from, 'from');
  const toMs = parseDate(query.to, 'to');
  if (fromMs >= toMs) throw badRequest('"from" must be earlier than "to".');
  if (fromMs > nowMs) throw badRequest('"from" is in the future — there is no historical data yet.');
  const maxDays = MAX_REQUEST_DAYS[granularity];
  if (toMs - fromMs > maxDays * MS_PER_DAY) {
    throw badRequest(`Range too large for ${granularity}: at most ${maxDays} days per request.`);
  }
  return { instrument, granularity, fromMs, toMs };
}

export function createCandlesController(service: CandlesService): RequestHandler {
  return async (req, res) => {
    const query = parseCandlesQuery(req.query as Record<string, unknown>, Date.now());
    const candles = await service.getCandles(query);
    res.json({ instrument: query.instrument, granularity: query.granularity, candles });
  };
}
