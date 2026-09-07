// One origin: server-rendered Astro, with the Hono API under /api.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import sirv from 'sirv';
import { createApi } from './api/index.mjs';
import { waitForDatabase } from './lib/db.mjs';
import { migrate, seed } from './lib/seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'dist', 'client');

// The container-internal port and bind address come from the environment.
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

function log(entry) {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

async function start() {
  await waitForDatabase();
  log({ level: 'info', msg: 'database reachable' });

  // The image applies its own schema and seed: grading re-creates the database.
  await migrate();
  await seed();
  log({ level: 'info', msg: 'schema and seed applied' });

  // The HTTP API is served on this same origin under the /api prefix.
  const apiRoot = new Hono();
  apiRoot.route('/api', createApi());
  const apiListener = getRequestListener(apiRoot.fetch);

  // Server-rendered pages call the same API in process rather than making a
  // network round trip back to this server.
  globalThis.__velaApiFetch = (request) => apiRoot.fetch(request);

  const assets = sirv(CLIENT_DIR, {
    dev: false,
    etag: true,
    brotli: true,
    gzip: true,
    setHeaders(res, pathname) {
      if (pathname.startsWith('/_astro/')) {
        res.setHeader('cache-control', 'public, max-age=31536000, immutable');
      }
    },
  });

  const { handler: astroHandler } = await import(path.join(ROOT, 'dist', 'server', 'entry.mjs'));

  /**
   * Render the app's own /404 page for an address no route matched, so every
   * error is a rendered page rather than a blank screen. Falls back to plain
   * text only if that page itself cannot be produced.
   */
  const renderNotFound = (req, res) => {
    const host = req.headers.host || `127.0.0.1:${PORT}`;
    const notFoundReq = new http.IncomingMessage(req.socket);
    notFoundReq.method = 'GET';
    notFoundReq.url = '/404';
    notFoundReq.headers = { ...req.headers, host };
    notFoundReq.push?.(null);

    // The status the reader's browser sees is 404, whatever the page renders as.
    const writeHead = res.writeHead.bind(res);
    res.writeHead = (_status, ...rest) => writeHead(404, ...rest);

    astroHandler(notFoundReq, res, () => {
      if (!res.writableEnded) {
        if (!res.headersSent) res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><title>Not found</title><p>That page does not exist.</p>');
      }
    });
  };

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')) {
      return apiListener(req, res);
    }
    // Build output and public files first, then the server-rendered routes.
    assets(req, res, () => {
      astroHandler(req, res, (err) => {
        if (err) {
          log({ level: 'error', msg: 'ssr error', error: String(err && err.stack || err) });
          if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
          res.end('<!doctype html><title>Vela</title><p>Something went wrong at our end.</p>');
          return;
        }
        // No route matched. Render the app's own 404 page rather than a bare
        // stub, so an error is always a rendered page and never a blank screen.
        if (!res.writableEnded) renderNotFound(req, res);
      });
    });
  });

  server.listen(PORT, HOST, () => {
    log({ level: 'info', msg: 'listening', port: PORT, host: HOST });
  });

  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      log({ level: 'info', msg: `received ${sig}, shutting down` });
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}

start().catch((err) => {
  log({ level: 'error', msg: 'failed to start', error: String(err && err.stack || err) });
  process.exit(1);
});
