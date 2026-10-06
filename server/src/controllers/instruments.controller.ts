import type { RequestHandler } from 'express';
import { GRANULARITY_SECONDS, INSTRUMENTS } from '../config/instruments.js';

export const listInstruments: RequestHandler = (_req, res) => {
  res.json({
    instruments: Object.values(INSTRUMENTS).map((instrument) => ({
      ...instrument,
      granularities: instrument.granularities.map((g) => ({ id: g, seconds: GRANULARITY_SECONDS[g] })),
    })),
  });
};
