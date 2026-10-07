import type { ProviderId } from '../types/providers';
import { getJson } from './api';

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  /** False when the provider needs an API key that is not set in the server's .env */
  configured: boolean;
  /** Env variable holding the key (empty when none is needed) */
  keyVariable: string;
}

export interface ServerHealth {
  status: 'ok';
  /** Default provider (DATA_PROVIDER in .env) */
  dataProvider: ProviderId;
  providers: ProviderStatus[];
}

export function fetchHealth(signal?: AbortSignal): Promise<ServerHealth> {
  return getJson<ServerHealth>('/api/health', undefined, signal);
}
