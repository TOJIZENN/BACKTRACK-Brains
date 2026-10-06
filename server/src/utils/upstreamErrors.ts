import { AxiosError } from 'axios';
import { HttpError } from './httpError.js';

/**
 * Maps network-level failures (no HTTP response) to typed errors.
 * Returns null when the error carries an HTTP response and needs provider-specific handling.
 */
export function mapTransportError(error: unknown, providerName: string): HttpError | null {
  if (error instanceof HttpError) return error;
  if (!(error instanceof AxiosError)) {
    return new HttpError(502, 'UPSTREAM_ERROR', `Unexpected error while contacting ${providerName}.`);
  }
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new HttpError(504, 'UPSTREAM_TIMEOUT', `${providerName} did not respond in time. Please try again.`);
  }
  if (error.response === undefined) {
    return new HttpError(
      503,
      'UPSTREAM_UNAVAILABLE',
      `Could not reach ${providerName}. Check your network connection and the provider base URL.`,
    );
  }
  return null;
}

export function missingKeyError(providerName: string, variable: string): HttpError {
  return new HttpError(
    503,
    'CONFIG_MISSING',
    `${variable} is not configured on the server. Copy .env.example to .env, add your ${providerName} key and restart the server.`,
  );
}
