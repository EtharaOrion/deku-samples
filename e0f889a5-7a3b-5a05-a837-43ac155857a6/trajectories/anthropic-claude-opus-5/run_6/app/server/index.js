import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getRequestListener } from '@hono/node-server';
import { createApi } from './api/index.js';
import { migrate, seed } from './seed.js';
import { log, logRequest, newRequestId } from './log.js';
import { pool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PORT = Number(process.env.PORT || 4173);
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

function serveStatic(req, res, pathname) {
  const clientDir = path.join(root, 'dist', 'client');
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel.includes('..')) return false;
  const file = path.join(clientDir, rel);
  if (!file.startsWith(clientDir)) return false;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': rel.startsWith('_astro/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

async function boot() {
  const started = Date.now();
  await waitForDatabase();
  await migrate();
  await seed();
  log({ level: 'info', msg: 'schema and seed applied', elapsed_ms: Date.now() - started });

  const api = createApi();
  const apiListener = getRequestListener(api.fetch);

  const { handler: astroHandler } = await import(path.join(root, 'dist', 'server', 'entry.mjs'));

  const server = http.createServer((req, res) => {
    const pathname = (req.url || '/').split('?')[0];
    if (pathname.startsWith('/api')) {
      apiListener(req, res);
      return;
    }
    if (serveStatic(req, res, pathname)) return;

    const requestId = req.headers['x-request-id'] || newRequestId();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);
    const t0 = Date.now();
    res.on('finish', () => {
      logRequest({
        requestId,
        method: req.method,
        route: pathname,
        status: res.statusCode,
        elapsedMs: Date.now() - t0,
        extra: { surface: 'page' },
      });
    });
    astroHandler(req, res, (err) => {
      if (err) {
        log({ level: 'error', request_id: requestId, msg: 'page render failed', error: String(err && err.stack) });
      }
      if (res.headersSent) {
        res.end();
        return;
      }
      // An unmatched address is still a rendered page, never a blank screen.
      const notFoundReq = Object.create(req);
      notFoundReq.url = '/404';
      notFoundReq.method = 'GET';
      astroHandler(notFoundReq, res, () => {
        if (!res.headersSent) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<!doctype html><html lang="en"><meta charset="utf-8"><title>That page does not exist.</title><p>That page does not exist.</p>',
          );
        } else {
          res.end();
        }
      });
    });
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.listen(PORT, HOST, () => {
    log({ level: 'info', msg: 'listening', host: HOST, port: PORT, public_url: process.env.APP_PUBLIC_URL || null });
  });

  const shutdown = (signal) => {
    log({ level: 'info', msg: 'shutting down', signal });
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    log({ level: 'error', msg: 'unhandled rejection', error: String(reason && (reason.stack || reason)) });
  });
}

async function waitForDatabase() {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      log({ level: 'warn', msg: 'waiting for database', error: String(err.message) });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

boot().catch((err) => {
  log({ level: 'error', msg: 'boot failed', error: String(err && err.stack) });
  process.exit(1);
});
