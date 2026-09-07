import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.js';
import { applySchema, waitForDatabase, pool } from './db.js';
import { seed } from './seed.js';
import { purgeExpiredTokens } from './services/auth.js';
import { info, error as logError } from './lib/log.js';
import { requestId as newRequestId } from './lib/crypto.js';
import { log } from './lib/log.js';

// Read both from the environment; never hardcode the outside port. 4173 is the
// container-internal port the brief names.
const PORT = Number(process.env.PORT || 4173);
// Bind 0.0.0.0: a loopback-only listener is unreachable from outside.
const HOST = process.env.HOST || '0.0.0.0';

// Static roots are resolved against the app directory rather than whatever the
// working directory happens to be when the process is started.
const appRoot = fileURLToPath(new URL('..', import.meta.url));
try {
  process.chdir(appRoot);
} catch {
  /* already there */
}

const app = new Hono();

// Cross-site form posts are refused. The comparison is against the Host header
// this request actually arrived on, so it is correct behind any hostname or
// port without either being hardcoded.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
app.use('*', async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const origin = c.req.header('origin');
  if (!origin) return next(); // a same-origin form post may send none
  const host = c.req.header('host');
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  if (host && originHost && originHost !== host) {
    return c.text(`Cross-site ${c.req.method} form submissions are forbidden`, 403);
  }
  return next();
});

// The HTTP API is served on the same origin under the /api prefix.
app.route('/api', createApi());

// Astro's server-rendered HTML, built ahead of time and served from disk.
const ssrEntry = new URL('../dist/server/entry.mjs', import.meta.url);
let astroHandler = null;

if (existsSync(ssrEntry)) {
  const mod = await import(ssrEntry.href);
  astroHandler = mod.handler;
  info('astro_ssr_loaded');
} else {
  logError('astro_ssr_missing', { path: ssrEntry.pathname });
}

app.use('/_astro/*', serveStatic({ root: './dist/client' }));
app.use('/fonts/*', serveStatic({ root: './dist/client' }));
app.use('/media/*', serveStatic({ root: './dist/client' }));
app.use('/downloads-artifact/*', serveStatic({ root: './dist/client' }));
app.get('/favicon.svg', serveStatic({ root: './dist/client', path: './favicon.svg' }));
app.get('/robots.txt', serveStatic({ root: './dist/client', path: './robots.txt' }));

// The Node adapter's handler speaks Node req/res, so the raw objects the
// node-server already holds are handed straight to it and the response is
// written by Astro itself.
app.all('*', async (c) => {
  const rid = c.req.header('x-request-id') || newRequestId();
  const started = Date.now();
  const url = new URL(c.req.url);

  if (!astroHandler) {
    return c.html(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Vela</title></head><body><main><h1>Something went wrong at our end.</h1><p>Reference ${rid}.</p><p>The site is starting. Reload in a moment.</p></main></body></html>`,
      503,
    );
  }

  const incoming = c.env?.incoming;
  const outgoing = c.env?.outgoing;
  if (!incoming || !outgoing) {
    logError('node_bridge_missing', { request_id: rid, route: url.pathname });
    return c.html('<!doctype html><html lang="en"><body><main><h1>Something went wrong at our end.</h1></main></body></html>', 500);
  }

  outgoing.setHeader('x-request-id', rid);

  try {
    await astroHandler(incoming, outgoing, undefined, { requestId: rid });
    log({ level: 'info', msg: 'request', request_id: rid, method: c.req.method, route: url.pathname, status: outgoing.statusCode, duration_ms: Date.now() - started });
  } catch (err) {
    logError('page_render_failed', { request_id: rid, route: url.pathname, error: String(err && err.stack ? err.stack : err) });
    log({ level: 'info', msg: 'request', request_id: rid, method: c.req.method, route: url.pathname, status: 500, duration_ms: Date.now() - started });
    if (!outgoing.headersSent) {
      outgoing.statusCode = 500;
      outgoing.setHeader('content-type', 'text/html; charset=utf-8');
    }
    if (!outgoing.writableEnded) {
      // Every error is a rendered page, never a blank screen.
      outgoing.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Something went wrong</title></head><body><main><h1>Something went wrong at our end.</h1><p>Reference ${rid}.</p><p><a href="/">Go to the front page</a></p></main></body></html>`,
      );
    }
  }
  return RESPONSE_ALREADY_SENT;
});

async function bootstrap() {
  await waitForDatabase();
  await applySchema();
  await seed();
  await purgeExpiredTokens();
}

let ready = false;
bootstrap()
  .then(() => {
    ready = true;
    info('bootstrap_complete');
  })
  .catch((err) => {
    logError('bootstrap_failed', { error: String(err && err.stack ? err.stack : err) });
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 500);
  });

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (addr) => {
  info('listening', { host: HOST, port: addr.port, public_url: process.env.APP_PUBLIC_URL || null });
});

const shutdown = (signal) => {
  info('shutting_down', { signal });
  server.close(() => {
    pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logError('unhandled_rejection', { error: String(reason && reason.stack ? reason.stack : reason) });
});

export { app, ready };
