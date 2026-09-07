import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { Hono } from 'hono';
import { buildApi } from './api.js';
import { migrateAndSeed } from './db/seed.js';
import { log, newRequestId } from './lib/log.js';
import { healthy as billingHealthy } from './lib/killbill.js';

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function main() {
  // The schema and the seed are applied by the image itself, so a database
  // created from scratch is ready by the time the first request arrives.
  await withRetry(() => migrateAndSeed(), 'database');

  const billing = await billingHealthy();
  log({ level: billing ? 'info' : 'warn', msg: 'billing healthcheck', healthy: billing });

  const app = new Hono();
  const api = buildApi();
  // The rendered pages dispatch into this same API in process, so a page and a
  // browser call reach one handler and one set of rules.
  globalThis.__velaApi = api;
  app.route('/', api);

  // Astro's server build renders every route as HTML on the same origin.
  const { handler: astroHandler } = await import('../dist/server/entry.mjs');

  app.use(
    '/*',
    serveStatic({
      root: './dist/client',
      // Hashed build assets are immutable; everything else revalidates.
      onFound: (path, c) => {
        if (path.includes('/_astro/')) {
          c.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          c.header('Cache-Control', 'public, max-age=0, must-revalidate');
        }
      },
    }),
  );

  app.all('*', async (c) => {
    const started = Date.now();
    const requestId = c.req.header('x-request-id') || newRequestId();
    const url = new URL(c.req.url);

    // Cross-site form posts are refused. A browser always sends Origin on a
    // form POST, and it must name the host this request arrived on.
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header('origin');
      const host = c.req.header('host');
      if (origin && host) {
        let originHost = null;
        try { originHost = new URL(origin).host; } catch { originHost = null; }
        if (originHost !== host) {
          log({
            level: 'warn', msg: 'cross-site form post refused', request_id: requestId,
            method: c.req.method, route: url.pathname, origin, host,
          });
          return c.html(errorPage(requestId, 'That did not work.'), 403);
        }
      }
    }
    // The node adapter renders straight onto the Node response, so the request
    // id is handed to it as a header and the stream is left to it.
    const { incoming, outgoing } = c.env;
    try {
      incoming.headers['x-request-id'] = requestId;
      outgoing.setHeader('X-Request-Id', requestId);
      await new Promise((resolve, reject) => {
        outgoing.on('finish', resolve);
        outgoing.on('close', resolve);
        outgoing.on('error', reject);
        astroHandler(incoming, outgoing, (err) => {
          if (err) { reject(err); return; }
          // Astro matched no route. Render the 404 page rather than a bare
          // string, so every error is a rendered page and never a blank screen.
          incoming.url = '/404';
          astroHandler(incoming, outgoing, (nextErr) => {
            if (nextErr) reject(nextErr);
            else {
              outgoing.statusCode = 404;
              outgoing.end('That page does not exist.');
              resolve();
            }
          });
        });
      });
      log({
        level: 'info', msg: 'request', request_id: requestId,
        method: c.req.method, route: url.pathname, path: url.pathname,
        status: outgoing.statusCode, duration_ms: Date.now() - started,
      });
      return RESPONSE_ALREADY_SENT;
    } catch (err) {
      log({
        level: 'error', msg: 'render failed', request_id: requestId,
        method: c.req.method, route: url.pathname, status: 500,
        duration_ms: Date.now() - started, error: err?.message, stack: err?.stack,
      });
      // Every error is a rendered page, never a blank screen.
      if (outgoing.headersSent) {
        outgoing.end();
        return RESPONSE_ALREADY_SENT;
      }
      return c.html(errorPage(requestId), 500);
    }
  });

  serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
    log({
      level: 'info', msg: 'listening',
      host: HOST, port: info.port,
      public_url: process.env.APP_PUBLIC_URL ?? null,
    });
  });
}

async function withRetry(fn, what, attempts = 30) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      log({ level: 'warn', msg: `${what} not ready`, attempt: i, error: err.message });
      await new Promise((r) => setTimeout(r, Math.min(2000, 250 * i)));
    }
  }
  throw lastError;
}

function errorPage(requestId, headline = 'Something went wrong at our end.') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Something went wrong</title>
<style>
:root{color-scheme:light}
body{margin:0;background:#f4f1ec;color:#14110f;font:400 16px/24px system-ui,sans-serif}
main{max-width:34rem;margin:0 auto;padding:80px 20px}
h1{font-size:24px;line-height:32px;margin:0 0 8px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
a{color:inherit}
</style></head><body><main>
<h1>${headline}</h1>
<p>Reference <code>${requestId}</code>.</p>
<p><a href="/">Back to the front page</a></p>
</main></body></html>`;
}

main().catch((err) => {
  log({ level: 'fatal', msg: 'startup failed', error: err?.message, stack: err?.stack });
  process.exit(1);
});

// A clean shutdown so the container stops promptly rather than being killed.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    log({ level: 'info', msg: 'shutting down', signal });
    process.exit(0);
  });
}
