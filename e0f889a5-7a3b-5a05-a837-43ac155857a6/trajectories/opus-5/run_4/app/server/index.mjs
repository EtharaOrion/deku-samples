import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { api } from './api.mjs';
import { pool, query, waitForDatabase, withClient } from './lib/db.mjs';
import { SCHEMA_SQL } from './lib/schema.mjs';
import { seed } from './lib/seed.mjs';
import { log, logRequest, newRequestId } from './lib/log.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// Container-internal port is fixed by the deployment contract at 4173; the host
// mapping is the outside world's business. Bind 0.0.0.0, never loopback.
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Apply the schema and seed under one advisory lock, so several containers
 * starting at once cannot race, and seeding twice cannot duplicate a row.
 */
async function migrate() {
  await withClient(async (client) => {
    await client.query('SELECT pg_advisory_lock($1)', [4173_0001]);
    try {
      await client.query(SCHEMA_SQL);
      await seed(client);
      log({ level: 'info', msg: 'migrate.done' });
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [4173_0001]);
    }
  });
}

const app = new Hono();

// One structured log line per request, carrying a request id generated at the
// edge and returned in the body of every error response.
app.use('*', async (c, next) => {
  const started = Date.now();
  const requestId = c.req.header('x-request-id') || newRequestId();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  try {
    await next();
  } finally {
    // Pages are written straight to the Node response, so the status is read
    // from there rather than from a Hono Response that was never built.
    const status = c.env?.outgoing?.headersSent
      ? c.env.outgoing.statusCode
      : c.res?.status ?? 0;
    logRequest({
      request_id: requestId,
      method: c.req.method,
      route: new URL(c.req.url).pathname,
      status,
      duration_ms: Date.now() - started,
    });
  }
});

/**
 * Same-origin check on form submissions.
 *
 * A cross-site POST of a form content type is refused. The comparison is made
 * against the Host header this request actually arrived on, so it holds behind
 * a port mapping and behind a proxy, and it never rejects the app's own forms.
 */
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
app.use('*', async (c, next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const origin = c.req.header('origin');
  // A form post with no Origin header at all is same-origin by definition in
  // every browser that sends one for cross-site posts.
  if (!origin) return next();

  const contentType = (c.req.header('content-type') || '').split(';')[0].trim().toLowerCase();
  const isFormLike = FORM_TYPES.includes(contentType);
  if (!isFormLike) return next();

  const host = c.req.header('host');
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  if (originHost && host && originHost === host) return next();

  log({
    level: 'warn', msg: 'origin.rejected', request_id: c.get('requestId'),
    origin, host, route: new URL(c.req.url).pathname,
  });
  return c.text('Cross-site form submissions are forbidden.', 403);
});

app.route('/api', api);

// Astro's SSR handler, built ahead of time. The whole site is server-rendered
// on this same origin; islands hydrate against /api.
const { handler: astroHandler } = await import('../dist/server/entry.mjs');

// Everything Astro emitted for the browser: hashed bundles, the fonts and the
// rest of public/. Served from one root so nothing added to public/ later has
// to be wired up by hand.
// serveStatic resolves its root against the working directory, so the process
// is pinned to the app root at boot and this stays correct wherever it starts.
process.chdir(root);
const CLIENT_ROOT = './dist/client';
app.use('/*', serveStatic({
  root: CLIENT_ROOT,
  onFound: (foundPath, c) => {
    // Hashed bundles are immutable; everything else revalidates.
    if (foundPath.includes('/_astro/')) {
      c.header('cache-control', 'public, max-age=31536000, immutable');
    } else {
      c.header('cache-control', 'public, max-age=3600');
    }
  },
}));

// Astro's middleware-mode handler is Node-style, so it is handed the raw
// request and response this server is already holding, and Hono is told the
// response has been written directly.
app.all('*', async (c) => {
  const { incoming, outgoing } = c.env;
  await new Promise((resolve, reject) => {
    outgoing.on('close', resolve);
    outgoing.on('finish', resolve);
    astroHandler(incoming, outgoing, (err) => {
      if (err) {
        reject(err);
        return;
      }
      if (!outgoing.writableEnded) {
        outgoing.statusCode = 404;
        outgoing.setHeader('content-type', 'text/plain; charset=utf-8');
        outgoing.end('That page does not exist.');
      }
      resolve();
    }, { requestId: c.get('requestId') });
  });
  return RESPONSE_ALREADY_SENT;
});

async function main() {
  log({ level: 'info', msg: 'boot.start', port: PORT, host: HOST });
  await waitForDatabase();
  await migrate();

  serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
    log({ level: 'info', msg: 'listening', address: info.address, port: info.port });
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    log({ level: 'info', msg: 'shutdown', signal });
    pool.end().finally(() => process.exit(0));
  });
}

process.on('unhandledRejection', (err) => {
  log({ level: 'error', msg: 'unhandledRejection', error: String(err && err.message), stack: err && err.stack });
});

main().catch((err) => {
  log({ level: 'error', msg: 'boot.failed', error: String(err && err.message), stack: err && err.stack });
  process.exit(1);
});
