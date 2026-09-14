import type { Hono } from 'hono';
import { pool } from '../db/pool.ts';
import { ApiEnv } from './util.ts';
import { killbillConfigured, kbFetch } from '../killbill.ts';

export function registerHealthRoute(app: Hono<ApiEnv>) {
  app.get('/api/health', async (c) => {
    try {
      await pool.query('SELECT 1');
      return c.json({ status: 'ok', database: 'ok', billing: killbillConfigured() ? 'configured' : 'absent', time: new Date().toISOString() });
    } catch (err) {
      return c.json({ status: 'error', database: 'error' }, 503);
    }
  });

  app.get('/api/health/billing', async (c) => {
    if (!killbillConfigured()) return c.json({ status: 'absent' }, 200);
    try {
      const res = await kbFetch('/1.0/healthcheck');
      return c.json({ status: res.status === 200 ? 'ok' : 'error', http_status: res.status }, res.status === 200 ? 200 : 503);
    } catch {
      return c.json({ status: 'error' }, 503);
    }
  });
}
