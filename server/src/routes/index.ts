import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';
import { listInstruments } from '../controllers/instruments.controller.js';
import { createCandlesController } from '../controllers/candles.controller.js';
import type { CandlesService } from '../services/candles.service.js';

export interface ApiDependencies {
  candlesService: CandlesService;
}

export function createApiRouter({ candlesService }: ApiDependencies): Router {
  const router = Router();
  router.get('/health', getHealth);
  router.get('/instruments', listInstruments);
  router.get('/candles', createCandlesController(candlesService));
  return router;
}
