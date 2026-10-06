import type { RequestHandler } from 'express';
import { isOandaConfigured } from '../config/env.js';

export const getHealth: RequestHandler = (_req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    oandaConfigured: isOandaConfigured(),
    mode: 'simulation-only',
  });
};
