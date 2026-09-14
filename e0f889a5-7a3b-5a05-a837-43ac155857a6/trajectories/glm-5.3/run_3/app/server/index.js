import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import { api } from './api.js';
import { seed } from './seed.js';
import { q } from './db.js';
import { env } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const clientDir = path.join(root, 'dist', 'client');

// The Astro middleware-mode build: a Node (req, res) handler.
const { handler: astroHandler } = await import(path.join(root, 'dist', 'server', 'entry.mjs'));

const rootApp = new Hono().route('/api', api);
const honoListener = getRequestListener(rootApp.fetch);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4'
};

const log = (obj) => console.log(JSON.stringify(obj));

const server = http.createServer((req, res) => {
  const start = Date.now();
  const requestId = (req.headers['x-request-id'] || crypto.randomBytes(8).toString('hex'));
  res.setHeader('x-request-id', requestId);
  res.on('finish', () => {
    if (!req.url || !req.url.startsWith('/api')) {
      log({ level: 'http', request_id: requestId, method: req.method, route: req.url, status: res.statusCode, ms: Date.now() - start });
    }
  });
  const url = new URL(req.url, 'http://x');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api')) {
    return honoListener(req, res);
  }

  // Static client assets first.
  if (pathname !== '/') {
    const file = path.join(clientDir, pathname.replace(/^\/+/, ''));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
      fs.createReadStream(file).pipe(res);
      return;
    }
  }

  // Everything else is an Astro route.
  return astroHandler(req, res);
});

server.on('clientError', (err, socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));

// Apply schema and seed, retrying so a slow database at container start
// does not kill the process before it can serve.
const boot = async (attempt = 1) => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await q(schema);
    await seed();
    log({ level: 'boot', message: 'schema applied and seed complete' });
    return true;
  } catch (e) {
    if (attempt >= 30) throw e;
    log({ level: 'boot', attempt, message: `waiting for the database: ${String(e && e.message || e).slice(0, 160)}` });
    await new Promise((r) => setTimeout(r, 2000));
    return boot(attempt + 1);
  }
};

boot()
  .then(() => new Promise((resolve) => server.listen(env.port, '0.0.0.0', resolve)))
  .then(() => log({ level: 'boot', message: `listening on 0.0.0.0:${env.port}` }))
  .catch((e) => {
    log({ level: 'fatal', message: String(e && e.message || e) });
    process.exit(1);
  });
