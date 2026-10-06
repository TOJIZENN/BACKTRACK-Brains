import { config, DATA_PROVIDER_NAMES, isProviderConfigured, providerKeyVariable } from './config/env.js';
import { createApp } from './app.js';

const app = createApp();
const providerName = DATA_PROVIDER_NAMES[config.dataProvider];

app.listen(config.port, () => {
  console.log(`[server] Listening on http://localhost:${config.port}`);
  console.log(`[server] Market data: ${providerName}. Simulation only — the provider is used for historical candles, never for orders.`);
  if (!isProviderConfigured()) {
    console.warn(`[server] ${providerKeyVariable()} is not set. Copy .env.example to .env and add your ${providerName} key to load candles.`);
  }
});
