import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The single .env lives at the repository root (next to .env.example).
dotenv.config({ path: path.resolve(serverRoot, '../.env'), quiet: true });

const DEFAULT_PORT = 4000;
const DEFAULT_OANDA_TIMEOUT_MS = 15_000;
const DEFAULT_OANDA_BASE_URL = 'https://api-fxpractice.oanda.com';

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number (got "${raw}")`);
  }
  return value;
}

export interface AppConfig {
  port: number;
  cacheDir: string;
  oanda: {
    apiKey: string;
    accountId: string;
    baseUrl: string;
    timeoutMs: number;
  };
}

export const config: AppConfig = {
  port: readNumber('PORT', DEFAULT_PORT),
  cacheDir: path.resolve(serverRoot, process.env.CACHE_DIR || 'cache'),
  oanda: {
    apiKey: process.env.OANDA_API_KEY?.trim() ?? '',
    accountId: process.env.OANDA_ACCOUNT_ID?.trim() ?? '',
    baseUrl: (process.env.OANDA_BASE_URL?.trim() || DEFAULT_OANDA_BASE_URL).replace(/\/+$/, ''),
    timeoutMs: readNumber('OANDA_TIMEOUT_MS', DEFAULT_OANDA_TIMEOUT_MS),
  },
};

export function isOandaConfigured(): boolean {
  return config.oanda.apiKey.length > 0 && config.oanda.apiKey !== 'your_api_key';
}
