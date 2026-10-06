import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../utils/httpError.js';

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} does not exist`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message } };
    res.status(err.status).json(body);
    return;
  }
  console.error('[server] Unhandled error:', err);
  const body: ApiErrorBody = {
    error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error. Check the server logs for details.' },
  };
  res.status(500).json(body);
};
