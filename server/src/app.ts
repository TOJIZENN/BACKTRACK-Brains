import path from 'node:path';
import express from 'express';
import { config, type DataProvider } from './config/env.js';
import type { CandlesService } from './services/candles.service.js';
import { createApiRouter, type ApiDependencies } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createCandlesService } from './services/candles.service.js';
import { createFileCandleCache } from './services/candleCache.js';
import { createCandleSource } from './services/candleSource.factory.js';

export function createDefaultDependencies(): ApiDependencies {
  const services = new Map<DataProvider, CandlesService>();
  return {
    // Built on first use. One cache folder per provider, so prices from different feeds never mix.
    getCandlesService: (provider) => {
      let service = services.get(provider);
      if (!service) {
        service = createCandlesService(createCandleSource(provider), createFileCandleCache(path.join(config.cacheDir, provider)));
        services.set(provider, service);
      }
      return service;
    },
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
