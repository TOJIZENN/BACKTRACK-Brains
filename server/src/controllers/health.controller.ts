import type { RequestHandler } from 'express';
import { config, DATA_PROVIDER_NAMES, isProviderConfigured, providerKeyVariable } from '../config/env.js';

export const getHealth: RequestHandler = (_req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    dataProvider: config.dataProvider,
    dataProviderName: DATA_PROVIDER_NAMES[config.dataProvider],
    providerConfigured: isProviderConfigured(),
    providerKeyVariable: providerKeyVariable(),
    mode: 'simulation-only',
  });
};
