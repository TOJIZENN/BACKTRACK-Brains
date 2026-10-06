import path from 'node:path';
import express from 'express';
import { config } from './config/env.js';
import { createApiRouter, type ApiDependencies } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createCandlesService } from './services/candles.service.js';
import { createFileCandleCache } from './services/candleCache.js';
import { createCandleSource } from './services/candleSource.factory.js';

export function createDefaultDependencies(): ApiDependencies {
  return {
    candlesService: createCandlesService(
      createCandleSource(),
      // One cache folder per provider, so prices from different feeds never mix.
      createFileCandleCache(path.join(config.cacheDir, config.dataProvider)),
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
