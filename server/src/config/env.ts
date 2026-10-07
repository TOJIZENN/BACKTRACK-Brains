import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// .env normally lives at the repository root (next to .env.example); server/.env is also accepted.
// When both exist, values from the root file win (dotenv never overrides already-set variables).
export const ENV_FILE_CANDIDATES = [path.resolve(serverRoot, '../.env'), path.resolve(serverRoot, '.env')];
export const loadedEnvFiles = ENV_FILE_CANDIDATES.filter((file) => !dotenv.config({ path: file, quiet: true }).error);

const DEFAULT_PORT = 4000;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;
const DEFAULT_OANDA_BASE_URL = 'https://api-fxpractice.oanda.com';
const DEFAULT_TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';
const DEFAULT_DUKASCOPY_BASE_URL = 'https://jetta.dukascopy.com/v1';
/** Values from .env.example that mean "not filled in yet". */
const PLACEHOLDER_KEYS = new Set(['your_api_key', 'your_twelve_data_api_key']);

export const DATA_PROVIDERS = ['dukascopy', 'twelvedata', 'oanda'] as const;
export type DataProvider = (typeof DATA_PROVIDERS)[number];

export const DATA_PROVIDER_NAMES: Record<DataProvider, string> = {
  dukascopy: 'Dukascopy',
  twelvedata: 'Twelve Data',
  oanda: 'OANDA',
};

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number (got "${raw}")`);
  }
  return value;
}

function readProvider(): DataProvider {
  const raw = (process.env.DATA_PROVIDER?.trim().toLowerCase() || 'dukascopy') as DataProvider;
  if (!DATA_PROVIDERS.includes(raw)) {
    throw new Error(`DATA_PROVIDER must be one of ${DATA_PROVIDERS.join(', ')} (got "${process.env.DATA_PROVIDER}")`);
  }
  return raw;
}

const baseUrl = (name: string, fallback: string) => (process.env[name]?.trim() || fallback).replace(/\/+$/, '');

export interface AppConfig {
  port: number;
  cacheDir: string;
  dataProvider: DataProvider;
  timeoutMs: number;
  dukascopy: { baseUrl: string };
  twelveData: { apiKey: string; baseUrl: string };
  oanda: { apiKey: string; accountId: string; baseUrl: string };
}

export const config: AppConfig = {
  port: readNumber('PORT', DEFAULT_PORT),
  cacheDir: path.resolve(serverRoot, process.env.CACHE_DIR || 'cache'),
  dataProvider: readProvider(),
  // OANDA_TIMEOUT_MS is still honoured for existing .env files.
  timeoutMs: readNumber('UPSTREAM_TIMEOUT_MS', readNumber('OANDA_TIMEOUT_MS', DEFAULT_UPSTREAM_TIMEOUT_MS)),
  dukascopy: { baseUrl: baseUrl('DUKASCOPY_BASE_URL', DEFAULT_DUKASCOPY_BASE_URL) },
  twelveData: {
    apiKey: process.env.TWELVE_DATA_API_KEY?.trim() ?? '',
    baseUrl: baseUrl('TWELVE_DATA_BASE_URL', DEFAULT_TWELVE_DATA_BASE_URL),
  },
  oanda: {
    apiKey: process.env.OANDA_API_KEY?.trim() ?? '',
    accountId: process.env.OANDA_ACCOUNT_ID?.trim() ?? '',
    baseUrl: baseUrl('OANDA_BASE_URL', DEFAULT_OANDA_BASE_URL),
  },
};

const hasKey = (key: string) => key.length > 0 && !PLACEHOLDER_KEYS.has(key);

export function isProviderConfigured(provider: DataProvider = config.dataProvider): boolean {
  if (provider === 'dukascopy') return true; // free, no key needed
  return hasKey(provider === 'twelvedata' ? config.twelveData.apiKey : config.oanda.apiKey);
}

/** Environment variable holding the active provider's key (for error messages); empty when none is needed. */
export function providerKeyVariable(provider: DataProvider = config.dataProvider): string {
  if (provider === 'dukascopy') return '';
  return provider === 'twelvedata' ? 'TWELVE_DATA_API_KEY' : 'OANDA_API_KEY';
}
