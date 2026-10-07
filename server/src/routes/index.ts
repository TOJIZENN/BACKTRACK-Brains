import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';
import { listInstruments } from '../controllers/instruments.controller.js';
import { createCandlesController } from '../controllers/candles.controller.js';
import type { DataProvider } from '../config/env.js';
import type { CandlesService } from '../services/candles.service.js';

export interface ApiDependencies {
  /** Candle service for a market-data provider (each has its own source and cache). */
  getCandlesService: (provider: DataProvider) => CandlesService;
}

export function createApiRouter({ getCandlesService }: ApiDependencies): Router {
  const router = Router();
  router.get('/health', getHealth);
  router.get('/instruments', listInstruments);
  router.get('/candles', createCandlesController(getCandlesService));
  return router;
}
