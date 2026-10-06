import { getJson } from './api';

export interface ServerHealth {
  status: 'ok';
  dataProvider: string;
  /** Human-readable provider name, e.g. "Twelve Data" */
  dataProviderName: string;
  providerConfigured: boolean;
  /** Env variable holding the provider key, e.g. "TWELVE_DATA_API_KEY" */
  providerKeyVariable: string;
}

export function fetchHealth(signal?: AbortSignal): Promise<ServerHealth> {
  return getJson<ServerHealth>('/api/health', undefined, signal);
}
