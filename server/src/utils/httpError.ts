export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'NO_DATA'
  | 'CONFIG_MISSING'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR';

/** An error with an HTTP status and a stable machine-readable code the client can act on. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string) => new HttpError(400, 'BAD_REQUEST', message);
