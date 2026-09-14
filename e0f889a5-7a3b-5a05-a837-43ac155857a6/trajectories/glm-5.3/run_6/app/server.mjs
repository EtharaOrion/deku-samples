// One process, one origin: the HTTP API under /api on Hono, every page on the
// Astro server-rendered handler. Binds 0.0.0.0 and reads the port from the
// environment.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRequestListener } from '@hono/node-server';
import { env } from './src/env.js';
import { ensureReady } from './src/lib/seed.js';
import { closeDb } from './src/lib/db.js';
import { logEvent, logError, logRequest, newRequestId } from './src/lib/log.js';

const PORT = env.internalPort;
const HOST = '0.0.0.0';
const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(here, 'dist', 'client');

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

// The adapter runs in middleware mode, so the built client assets are served
// here rather than by the adapter.
async function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = pathname.replace(/^\/+/, '');
  const candidate = path.join(CLIENT_DIR, relative);
  if (!candidate.startsWith(CLIENT_DIR)) return false;

  let filePath = candidate;
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    return false;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

function safePathname(url) {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url;
  }
}

async function main() {
  const { handler: astroHandler } = await import('./dist/server/entry.mjs');
  const { default: api } = await import('./src/api/app.js');

  const apiListener = getRequestListener(api.fetch, { overrideGlobalObjects: false });

  const server = http.createServer(async (req, res) => {
    const url = req.url || '/';
    if (url === '/api' || url.startsWith('/api/')) {
      apiListener(req, res);
      return;
    }

    // Pages and static assets are logged here; the API logs itself.
    const startedAt = Date.now();
    const requestId = req.headers['x-request-id'] || newRequestId();
    res.on('finish', () => {
      const pathname = safePathname(url);
      logRequest({
        requestId,
        method: req.method,
        route: pathname,
        status: res.statusCode,
        startedAt
      });
    });

    if (await serveStatic(req, res)) return;
    astroHandler(req, res);
  });

  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
  });

  logEvent('server.listening', { host: HOST, port: PORT });

  await ensureReady();
  logEvent('server.ready', { host: HOST, port: PORT });

  const shutdown = async (signal) => {
    logEvent('server.shutdown', { signal });
    server.close();
    await closeDb().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logError('server.start_failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
