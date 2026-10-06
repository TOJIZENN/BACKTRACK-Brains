const REQUEST_TIMEOUT_MS = 60_000;

/** Error with the stable code returned by our backend (e.g. INVALID_CREDENTIALS, RATE_LIMITED). */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export async function getJson<T>(path: string, params?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = params ? `${path}?${new URLSearchParams(params)}` : path;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, { signal: combined });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) {
      throw new ApiError('CLIENT_TIMEOUT', 'The request took too long. The server or the market-data provider may be slow — please try again.');
    }
    throw new ApiError('SERVER_UNREACHABLE', 'Cannot reach the backtest server. Is it running (npm run dev)?');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    if (!err && response.status >= 500) {
      throw new ApiError('SERVER_UNREACHABLE', 'Cannot reach the backtest server. Is it running (npm run dev)?', response.status);
    }
    throw new ApiError(err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (HTTP ${response.status}).`, response.status);
  }
  return body as T;
}
