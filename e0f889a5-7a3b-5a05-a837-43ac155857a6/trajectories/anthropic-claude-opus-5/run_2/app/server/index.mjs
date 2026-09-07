import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { pool, waitForDatabase } from './lib/db.mjs';
import { ensureReady } from './db/seed.mjs';
import { AppError, errorBody, notFound } from './lib/errors.mjs';
import authRoutes from './routes/auth.mjs';
import catalogueRoutes from './routes/catalogue.mjs';
import cartRoutes from './routes/cart.mjs';
import orderRoutes from './routes/orders.mjs';
import accountRoutes from './routes/account.mjs';
import releaseRoutes from './routes/releases.mjs';
import firmwareRoutes, { sessions as flashSessionRoutes } from './routes/firmware.mjs';
import * as killbill from './lib/killbill.mjs';

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const CLIENT_DIR = fileURLToPath(new URL('../dist/client/', import.meta.url));

const app = new Hono();

/*
 * One line of JSON per request on stdout, carrying the method, route, status and
 * elapsed milliseconds. The request_id is generated at the edge and is the same
 * value every error response body carries.
 */
app.use('*', async (c, next) => {
  const started = process.hrtime.bigint();
  const requestId = c.req.header('x-request-id') || crypto.randomUUID();
  c.set('requestId', requestId);
  c.set('log', (fields) => console.log(JSON.stringify({
    ts: new Date().toISOString(), request_id: requestId, ...fields,
  })));

  await next();

  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  c.header('x-request-id', requestId);
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: c.res.status >= 500 ? 'error' : 'info',
    request_id: requestId,
    method: c.req.method,
    route: new URL(c.req.url).pathname,
    status: c.res.status,
    duration_ms: Number(elapsed.toFixed(2)),
  }));
});

const api = new Hono();

api.get('/health', async (c) => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    return c.json({ status: 'unhealthy', reason: 'database', request_id: c.get('requestId') }, 503);
  }
  return c.json({ status: 'ok', service: 'vela-storefront' });
});

api.get('/readiness', async (c) => {
  const [db, billing] = await Promise.all([
    pool.query('SELECT 1').then(() => true, () => false),
    killbill.healthy(),
  ]);
  return c.json({ database: db, billing }, db ? 200 : 503);
});

api.route('/auth', authRoutes);
api.route('/products', catalogueRoutes);
api.route('/cart', cartRoutes);
api.route('/orders', orderRoutes);
api.route('/account', accountRoutes);
api.route('/releases', releaseRoutes);
api.route('/firmware', firmwareRoutes);
api.route('/flash-sessions', flashSessionRoutes);

api.all('*', () => { throw notFound('That endpoint does not exist.'); });

/** Errors are a rendered body with a code, a message and the request id. */
api.onError((err, c) => {
  const requestId = c.get('requestId');
  const { status, body } = errorBody(err, requestId);
  if (!(err instanceof AppError)) {
    console.log(JSON.stringify({
      ts: new Date().toISOString(), level: 'error', request_id: requestId,
      msg: 'unhandled error', error: err.message, stack: err.stack,
    }));
  }
  return c.json(body, status);
});

app.route('/api', api);

/*
 * Static assets from the Astro client build. serveStatic resolves its root
 * against the working directory, so the root is expressed relative to this
 * file's own location instead: the server then serves correctly whatever
 * directory it happens to be started from.
 */
const clientRoot = relative(process.cwd(), CLIENT_DIR) || '.';
for (const path of ['/_astro/*', '/fonts/*', '/media/*', '/favicon.svg', '/robots.txt']) {
  app.use(path, serveStatic({ root: clientRoot }));
}

// Everything else is server-rendered HTML from Astro. The node adapter runs in
// middleware mode, so it is handed the underlying Node request and response and
// writes the reply itself.
const ssrEntry = new URL('../dist/server/entry.mjs', import.meta.url);
let ssrHandler = null;
if (existsSync(fileURLToPath(ssrEntry))) {
  const mod = await import(ssrEntry.href);
  ssrHandler = mod.handler;
}

app.all('*', async (c) => {
  if (!ssrHandler) {
    return c.html('<!doctype html><title>Vela</title><p>The site is still starting. Reload in a moment.</p>', 503);
  }
  const { incoming, outgoing } = c.env;
  await new Promise((resolve, reject) => {
    outgoing.on('close', resolve);
    outgoing.on('finish', resolve);
    outgoing.on('error', reject);
    try {
      ssrHandler(incoming, outgoing, (err) => {
        if (err) return reject(err);
        // Astro had no route for this path: render the app's own not-found page
        // rather than a blank screen.
        if (!outgoing.writableEnded) {
          outgoing.statusCode = 404;
          outgoing.setHeader('content-type', 'text/html; charset=utf-8');
          outgoing.end(notFoundHtml(c.get('requestId')));
        }
        resolve();
      }, { requestId: c.get('requestId') });
    } catch (err) {
      reject(err);
    }
  });
  return RESPONSE_ALREADY_SENT;
});

function notFoundHtml(requestId) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>That page does not exist</title>
    <style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f7f6f3;color:#1a1a19;padding:80px 20px}
    main{max-width:40rem;margin:0 auto}a{color:inherit}code{font-family:ui-monospace,Menlo,monospace}</style></head>
    <body><main><h1>That page does not exist.</h1>
    <p>Check the address, or start again from the front page.</p>
    <p><a href="/">Back to the front page</a> &middot; <a href="/shop">Shop</a></p>
    <p><code>${requestId}</code></p></main></body></html>`;
}

app.onError((err, c) => {
  const requestId = c.get('requestId');
  console.log(JSON.stringify({
    ts: new Date().toISOString(), level: 'error', request_id: requestId,
    msg: 'unhandled error', error: err.message, stack: err.stack,
  }));
  const accepts = c.req.header('accept') || '';
  if (accepts.includes('application/json')) {
    const { status, body } = errorBody(err, requestId);
    return c.json(body, status);
  }
  return c.html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Something went wrong</title>
     <style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f7f6f3;color:#1a1a19;padding:80px 20px}
     main{max-width:40rem;margin:0 auto}code{font-family:ui-monospace,Menlo,monospace}</style></head>
     <body><main><h1>Something went wrong at our end.</h1>
     <p>Reference <code>${requestId}</code>.</p>
     <p><a href="/">Back to the front page</a></p></main></body></html>`,
    500,
  );
});

async function boot() {
  const log = (fields) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
  log({ level: 'info', msg: 'waiting for database' });
  await waitForDatabase();
  log({ level: 'info', msg: 'applying schema and seed' });
  await ensureReady();
  log({ level: 'info', msg: 'database ready' });

  serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
    log({ level: 'info', msg: 'listening', port: info.port, host: HOST });
  });
}

boot().catch((err) => {
  console.log(JSON.stringify({
    ts: new Date().toISOString(), level: 'fatal', msg: 'failed to start', error: err.message, stack: err.stack,
  }));
  process.exit(1);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: `received ${signal}` }));
    pool.end().finally(() => process.exit(0));
  });
}
