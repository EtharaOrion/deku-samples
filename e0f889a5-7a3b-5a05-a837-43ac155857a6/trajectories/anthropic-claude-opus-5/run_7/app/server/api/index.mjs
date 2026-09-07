import { Hono } from 'hono';
import crypto from 'node:crypto';
import { AppError, notFound } from '../lib/errors.mjs';
import { pool } from '../lib/db.mjs';
import authRoutes from './auth.mjs';
import catalogueRoutes from './catalogue.mjs';
import cartRoutes from './cart.mjs';
import orderRoutes from './orders.mjs';
import accountRoutes from './account.mjs';
import softwareRoutes from './software.mjs';

export function createApi() {
  const api = new Hono();

  // One JSON line per request on stdout, carrying the request identifier that the
  // error body also names.
  api.use('*', async (c, next) => {
    const requestId = c.req.header('x-request-id') || crypto.randomUUID();
    c.set('requestId', requestId);
    const started = process.hrtime.bigint();
    let status = 500;
    try {
      await next();
      status = c.res.status;
    } catch (err) {
      const handled = toResponse(err, requestId);
      status = handled.status;
      c.res = new Response(JSON.stringify(handled.body), {
        status: handled.status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId },
      });
      if (handled.status >= 500) {
        process.stdout.write(JSON.stringify({
          level: 'error', request_id: requestId, msg: 'unhandled error',
          error: String(err && err.stack || err),
        }) + '\n');
      }
    } finally {
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      c.res.headers.set('x-request-id', requestId);
      process.stdout.write(JSON.stringify({
        level: status >= 500 ? 'error' : 'info',
        ts: new Date().toISOString(),
        request_id: requestId,
        method: c.req.method,
        route: new URL(c.req.url).pathname,
        status,
        duration_ms: Math.round(elapsed * 1000) / 1000,
      }) + '\n');
    }
  });

  api.get('/health', async (c) => {
    try {
      await pool.query('SELECT 1');
      return c.json({ status: 'ok', request_id: c.get('requestId') });
    } catch {
      return c.json({ status: 'starting', request_id: c.get('requestId') }, 503);
    }
  });

  api.route('/auth', authRoutes);
  api.route('/', catalogueRoutes);
  api.route('/cart', cartRoutes);
  api.route('/orders', orderRoutes);
  api.route('/account', accountRoutes);
  api.route('/', softwareRoutes);

  api.all('*', (c) => {
    const requestId = c.get('requestId');
    return c.json({ code: 'not_found', message: 'That page does not exist.', request_id: requestId }, 404);
  });

  api.onError((err, c) => {
    const requestId = c.get('requestId') || crypto.randomUUID();
    const handled = toResponse(err, requestId);
    return c.json(handled.body, handled.status);
  });

  return api;
}

function toResponse(err, requestId) {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { code: err.code, message: err.message, request_id: requestId, ...err.extra },
    };
  }
  // A constraint the store enforced surfaces as a conflict, never a 5xx.
  if (err && err.code === '23505') {
    return {
      status: 409,
      body: { code: 'conflict', message: 'That was already taken.', request_id: requestId },
    };
  }
  if (err && (err.code === '23514' || err.code === '23503')) {
    return {
      status: 400,
      body: { code: 'invalid_request', message: 'That did not work.', request_id: requestId },
    };
  }
  return {
    status: 500,
    body: {
      code: 'internal_error',
      message: `Something went wrong at our end. Reference ${requestId}.`,
      request_id: requestId,
    },
  };
}
