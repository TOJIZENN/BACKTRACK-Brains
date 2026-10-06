import { getJson } from './api';

export interface ServerHealth {
  status: 'ok';
  oandaConfigured: boolean;
}

export function fetchHealth(signal?: AbortSignal): Promise<ServerHealth> {
  return getJson<ServerHealth>('/api/health', undefined, signal);
}
