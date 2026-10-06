import express from 'express';
import { config } from './config/env.js';
import { createApiRouter, type ApiDependencies } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createCandlesService } from './services/candles.service.js';
import { createFileCandleCache } from './services/candleCache.js';
import { createOandaClient } from './services/oanda/oanda.client.js';
import { createOandaCandleSource } from './services/oanda/oanda.service.js';

export function createDefaultDependencies(): ApiDependencies {
  return {
    candlesService: createCandlesService(
      createOandaCandleSource(createOandaClient()),
      createFileCandleCache(config.cacheDir),
    ),
  };
}

export function createApp(deps: ApiDependencies = createDefaultDependencies()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use('/api', createApiRouter(deps));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
