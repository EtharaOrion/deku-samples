import { Hono } from 'hono';
import { AppError, notFound } from './lib/errors.js';
import { log, newRequestId } from './lib/log.js';
import { pool } from './lib/db.js';
import authRoutes from './routes/auth.js';
import catalogueRoutes from './routes/catalogue.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import accountRoutes from './routes/account.js';
import releaseRoutes from './routes/releases.js';
import firmwareRoutes from './routes/firmware.js';

export function buildApi() {
  const api = new Hono().basePath('/api');

  // One line of JSON per request, carrying a request identifier generated at the
  // edge, which is the same value returned in the body of every error response.
  api.use('*', async (c, next) => {
    const started = Date.now();
    const requestId = c.req.header('x-request-id') || newRequestId();
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    try {
      await next();
    } finally {
      log({
        level: 'info',
        msg: 'request',
        request_id: requestId,
        method: c.req.method,
        route: c.req.routePath ?? new URL(c.req.url).pathname,
        path: new URL(c.req.url).pathname,
        status: c.res?.status ?? 0,
        duration_ms: Date.now() - started,
      });
    }
  });

  api.get('/health', async (c) => {
    try {
      await pool.query('SELECT 1');
      return c.json({ status: 'ok' });
    } catch (err) {
      return c.json({ status: 'degraded', error: 'database unreachable' }, 503);
    }
  });

  api.route('/auth', authRoutes);
  api.route('/', catalogueRoutes);
  api.route('/cart', cartRoutes);
  api.route('/orders', orderRoutes);
  api.route('/account', accountRoutes);
  api.route('/releases', releaseRoutes);
  api.route('/', firmwareRoutes);

  api.notFound((c) =>
    c.json(
      { code: 'not_found', message: 'That page does not exist.', request_id: c.get('requestId') },
      404,
    ),
  );

  api.onError((err, c) => {
    const requestId = c.get('requestId') ?? newRequestId();
    if (err instanceof AppError) {
      log({
        level: 'warn', msg: 'client error', request_id: requestId,
        code: err.code, status: err.status, error: err.message,
        path: new URL(c.req.url).pathname,
      });
      return c.json(
        { code: err.code, message: err.message, request_id: requestId, ...err.extra },
        err.status,
      );
    }
    log({
      level: 'error', msg: 'unhandled error', request_id: requestId,
      error: err?.message, stack: err?.stack, path: new URL(c.req.url).pathname,
    });
    return c.json(
      {
        code: 'internal_error',
        message: `Something went wrong at our end. Reference ${requestId}.`,
        request_id: requestId,
      },
      500,
    );
  });

  return api;
}
