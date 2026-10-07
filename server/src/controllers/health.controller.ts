import type { RequestHandler } from 'express';
import { config, DATA_PROVIDER_NAMES, DATA_PROVIDERS, isProviderConfigured, providerKeyVariable } from '../config/env.js';

export const getHealth: RequestHandler = (_req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    dataProvider: config.dataProvider,
    dataProviderName: DATA_PROVIDER_NAMES[config.dataProvider],
    providerConfigured: isProviderConfigured(),
    providerKeyVariable: providerKeyVariable(),
    /** All market-data sources the UI can choose from; keys stay on the server. */
    providers: DATA_PROVIDERS.map((id) => ({
      id,
      name: DATA_PROVIDER_NAMES[id],
      configured: isProviderConfigured(id),
      keyVariable: providerKeyVariable(id),
    })),
    mode: 'simulation-only',
  });
};
