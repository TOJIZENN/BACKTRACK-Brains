import { config, type DataProvider } from '../config/env.js';
import type { HistoricalCandleSource } from './candleSource.js';
import { createOandaClient } from './oanda/oanda.client.js';
import { createOandaCandleSource } from './oanda/oanda.service.js';
import { createTwelveDataClient } from './twelvedata/twelvedata.client.js';
import { createTwelveDataCandleSource } from './twelvedata/twelvedata.service.js';

/** Builds the candle source selected by DATA_PROVIDER. */
export function createCandleSource(provider: DataProvider = config.dataProvider): HistoricalCandleSource {
  switch (provider) {
    case 'twelvedata':
      return createTwelveDataCandleSource(createTwelveDataClient());
    case 'oanda':
      return createOandaCandleSource(createOandaClient());
  }
}
