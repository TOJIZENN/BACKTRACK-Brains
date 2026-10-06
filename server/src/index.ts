import { config, isOandaConfigured } from './config/env.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`[server] Listening on http://localhost:${config.port}`);
  console.log('[server] Simulation only — OANDA is used for historical candles, never for orders.');
  if (!isOandaConfigured()) {
    console.warn('[server] OANDA_API_KEY is not set. Copy .env.example to .env and add your key to load candles.');
  }
});
