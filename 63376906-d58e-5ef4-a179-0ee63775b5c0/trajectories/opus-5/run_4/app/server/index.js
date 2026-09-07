import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { migrate, waitForDb } from './db.js';
import { seed } from './seed.js';
import { readSession } from './auth.js';
import { HttpError } from './util.js';
import { api } from './routes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

const app = new Hono();

app.use('*', async (c, next) => {
  c.set('session', await readSession(c));
  await next();
});

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json(err.body, err.status);
  console.error('[ravel]', err);
  return c.json({ error: 'internal_error', message: String(err.message || err) }, 500);
});

let ready = false;
app.get('/api/health', (c) => (ready ? c.json({ status: 'ok' }, 200) : c.json({ status: 'starting' }, 503)));

app.route('/api', api);

app.all('/api/*', (c) => c.json({ error: 'not_found', path: new URL(c.req.url).pathname }, 404));

// Static production build, one origin.
app.use('/assets/*', serveStatic({ root: './dist' }));
app.use('/fonts/*', serveStatic({ root: './dist' }));
app.use('/favicon.svg', serveStatic({ root: './dist' }));
app.use('/robots.txt', serveStatic({ root: './dist' }));

let indexHtml = null;
app.get('*', async (c) => {
  if (indexHtml === null) {
    const p = join(DIST, 'index.html');
    indexHtml = existsSync(p) ? await readFile(p, 'utf8') : '<!doctype html><title>Ravel</title><p>Build missing.';
  }
  return c.html(indexHtml);
});

const PORT = 4173;

async function boot() {
  await waitForDb();
  await migrate();
  const r = await seed();
  console.log(`[ravel] database ready; seeded=${r.seeded}`);
  ready = true;
}

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`[ravel] listening on 0.0.0.0:${info.port}`);
});

boot().catch((e) => {
  console.error('[ravel] boot failed', e);
  process.exit(1);
});

process.on('SIGTERM', () => process.exit(0));
process.on('unhandledRejection', (e) => console.error('[ravel] unhandled', e));
