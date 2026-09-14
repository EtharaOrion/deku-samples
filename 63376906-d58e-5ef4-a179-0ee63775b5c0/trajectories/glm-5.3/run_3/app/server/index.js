import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { api } from './api.js';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const app = new Hono();

app.route('/', api);

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };

app.use('*', async (c, next) => {
  if (c.req.method !== 'GET' || c.req.path.startsWith('/api')) return next();
  const p = join(dist, c.req.path.replace(/^\/+/, ''));
  if (existsSync(p) && statSync(p).isFile()) {
    const body = readFileSync(p);
    return c.body(body, 200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  }
  const body = readFileSync(join(dist, 'index.html'));
  return c.body(body, 200, { 'content-type': 'text/html; charset=utf-8' });
});

const port = Number(process.env.PORT || 4173);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => console.log(`ravel listening on ${info.address}:${info.port}`));
