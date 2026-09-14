import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, migrateAndSeed } from './db.js';
import { seedWithClient } from './seed.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import collectorRoutes from './routes/collectors.js';
import batchRoutes from './routes/batches.js';
import runRoutes from './routes/runs.js';
import lotRoutes from './routes/lots.js';
import qualityRoutes from './routes/quality.js';
import ledgerRoutes from './routes/ledger.js';
import carbonRoutes from './routes/carbon.js';
import certificateRoutes from './routes/certificates.js';
import recordRoutes from './routes/record.js';
import inboundRoutes from './routes/inbound.js';
import customerRoutes from './routes/customers.js';
import siteRoutes from './routes/sites.js';
import { currentSession } from './lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = new Hono();
const db = getDb();

app.use('*', async (c, next) => {
  c.set('db', db);
  await next();
});

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.route('/api/auth', authRoutes);
app.route('/api', publicRoutes);
app.route('/api', collectorRoutes);
app.route('/api', batchRoutes);
app.route('/api', runRoutes);
app.route('/api', lotRoutes);
app.route('/api', qualityRoutes);
app.route('/api', ledgerRoutes);
app.route('/api', carbonRoutes);
app.route('/api', certificateRoutes);
app.route('/api', recordRoutes);
app.route('/api', inboundRoutes);
app.route('/api', customerRoutes);
app.route('/api', siteRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  console.error('unhandled', err);
  const status = err.status || 500;
  return c.json({ error: err.code || 'internal_error', message: err.message }, status);
});

// Static production build, with SPA fallback for client-side routes.
const dist = path.join(__dirname, '..', 'dist');
const indexHtml = fs.existsSync(path.join(dist, 'index.html'))
  ? fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
  : '<!doctype html><title>Ravel</title><p>Client build missing.</p>';

app.get('*', (c) => {
  const url = new URL(c.req.url);
  const filePath = path.join(dist, url.pathname);
  if (url.pathname.startsWith('/api/')) return c.json({ error: 'not_found' }, 404);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const body = fs.readFileSync(filePath);
    const type = filePath.endsWith('.js') ? 'text/javascript'
      : filePath.endsWith('.css') ? 'text/css'
        : filePath.endsWith('.woff2') ? 'font/woff2'
          : filePath.endsWith('.svg') ? 'image/svg+xml'
            : filePath.endsWith('.png') ? 'image/png'
              : 'application/octet-stream';
    return c.body(body, 200, { 'content-type': type, 'cache-control': 'public, max-age=3600' });
  }
  return c.html(indexHtml);
});

const port = Number(process.env.PORT || 4173);

// The backing services are already running, but a slow listener at start is not
// a reason to die: retry the schema and seed until postgres answers.
let started = false;
for (let attempt = 1; attempt <= 30 && !started; attempt += 1) {
  try {
    await migrateAndSeed(seedWithClient);
    console.log('schema and seed applied');
    started = true;
  } catch (e) {
    console.error(`start attempt ${attempt} failed: ${e.message}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
if (!started) {
  console.error('could not reach the backing services; exiting');
  process.exit(1);
}

const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Ravel listening on http://0.0.0.0:${info.port}`);
});

export default server;
