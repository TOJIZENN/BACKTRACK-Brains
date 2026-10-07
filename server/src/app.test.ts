import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { HttpError } from './utils/httpError.js';
import type { CandlesService } from './services/candles.service.js';

function appWith(getCandles = vi.fn<CandlesService['getCandles']>(async () => [])) {
  return { app: createApp({ candlesService: { getCandles } }), getCandles };
}

describe('API', () => {
  it('GET /api/health', async () => {
    const res = await request(appWith().app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', mode: 'simulation-only' });
    expect(['dukascopy', 'twelvedata', 'oanda']).toContain(res.body.dataProvider);
    expect(typeof res.body.providerConfigured).toBe('boolean');
  });

  it('GET /api/instruments lists XAU_USD with its timeframes', async () => {
    const res = await request(appWith().app).get('/api/instruments');
    expect(res.body.instruments[0].symbol).toBe('XAU_USD');
    expect(res.body.instruments[0].granularities.map((g: { id: string }) => g.id)).toEqual(['M1', 'M5', 'M15', 'H1']);
  });

  it('GET /api/candles passes a validated query to the service', async () => {
    const candle = { timestamp: '2026-01-15T10:00:00Z', open: 1, high: 2, low: 0.5, close: 1.5, volume: 3 };
    const { app, getCandles } = appWith(vi.fn<CandlesService['getCandles']>(async () => [candle]));
    const res = await request(app).get('/api/candles').query({
      instrument: 'XAU_USD',
      granularity: 'M5',
      from: '2026-01-15T00:00:00Z',
      to: '2026-01-16T00:00:00Z',
    });
    expect(res.status).toBe(200);
    expect(res.body.candles).toEqual([candle]);
    expect(getCandles).toHaveBeenCalledWith({
      instrument: 'XAU_USD',
      granularity: 'M5',
      fromMs: Date.parse('2026-01-15T00:00:00Z'),
      toMs: Date.parse('2026-01-16T00:00:00Z'),
    });
  });

  it.each([
    [{ instrument: 'EUR_USD', granularity: 'M5', from: '2026-01-15', to: '2026-01-16' }, 'Unsupported instrument'],
    [{ instrument: 'XAU_USD', granularity: 'D', from: '2026-01-15', to: '2026-01-16' }, 'Unsupported granularity'],
    [{ instrument: 'XAU_USD', granularity: 'M5', from: 'yesterday', to: '2026-01-16' }, 'not a valid date'],
    [{ instrument: 'XAU_USD', granularity: 'M5', from: '2026-01-16', to: '2026-01-15' }, 'earlier than'],
    [{ instrument: 'XAU_USD', granularity: 'M1', from: '2026-01-01', to: '2026-02-01' }, 'Range too large'],
    [{ instrument: 'XAU_USD', granularity: 'M5', from: '2999-01-01', to: '2999-01-02' }, 'in the future'],
  ])('rejects invalid query %#', async (query, message) => {
    const res = await request(appWith().app).get('/api/candles').query(query);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toContain(message);
  });

  it('forwards typed upstream errors to the client', async () => {
    const { app } = appWith(
      vi.fn<CandlesService['getCandles']>(async () => {
        throw new HttpError(429, 'RATE_LIMITED', 'slow down');
      }),
    );
    const res = await request(app)
      .get('/api/candles')
      .query({ instrument: 'XAU_USD', granularity: 'M5', from: '2026-01-15', to: '2026-01-16' });
    expect(res.status).toBe(429);
    expect(res.body.error).toEqual({ code: 'RATE_LIMITED', message: 'slow down' });
  });
});
