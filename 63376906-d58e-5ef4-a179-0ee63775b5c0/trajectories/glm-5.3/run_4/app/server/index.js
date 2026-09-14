import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q } from './db.js';
import { runSeed } from './seed/index.js';
import { Refused } from './lib/http.js';

import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import batchRoutes from './routes/batches.js';
import runRoutes from './routes/runs.js';
import lotRoutes from './routes/lots.js';
import ledgerRoutes from './routes/ledger.js';
import certificateRoutes from './routes/certificates.js';
import collectorRoutes from './routes/collectors.js';
import verifyRoutes from './routes/verify.js';
import recordRoutes from './routes/record.js';
import miscRoutes from './routes/misc.js';
import qualityRoutes from './routes/quality.js';
import carbonRoutes from './routes/carbon.js';
import energyRoutes from './routes/energy.js';
import commercialRoutes from './routes/commercial.js';
import exportRoutes from './routes/exports.js';
import factorRoutes, { siteCertification } from './routes/factors.js';
import restatementRoutes from './routes/restatements.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 4173);

const app = new Hono();

// health first, no session
app.get('/api/health', async (c) => {
  try {
    await q('SELECT 1');
    return c.json({ status: 'ok', ready: true });
  } catch {
    return c.json({ status: 'degraded', ready: false }, 503);
  }
});

app.route('/api/auth', authRoutes);
app.route('/api', publicRoutes);
app.route('/api', miscRoutes);
app.route('/api/verify', verifyRoutes);
app.route('/api/batches', batchRoutes);
app.route('/api/runs', runRoutes);
app.route('/api/lots', lotRoutes);
app.route('/api/balance-periods', ledgerRoutes);
app.route('/api/certificates', certificateRoutes);
app.route('/api/collectors', collectorRoutes);
app.route('/api/record', recordRoutes);
app.route('/api', qualityRoutes);
app.route('/api', carbonRoutes);
app.route('/api', energyRoutes);
app.route('/api', commercialRoutes);
app.route('/api/exports', exportRoutes);
app.route('/api/conversion-factors', factorRoutes);
app.route('/api/sites', new Hono().post('/:reference/certification', (c) => siteCertification(c)));
app.route('/api/restatements', restatementRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'not_found' }, 404);
  }
  const index = path.join(DIST, 'index.html');
  if (fs.existsSync(index)) {
    return c.html(fs.readFileSync(index, 'utf8'));
  }
  return c.text('Not found', 404);
});

app.onError((err, c) => {
  if (err instanceof Refused) {
    return c.json(err.body, err.status);
  }
  console.error('[api] error', err);
  return c.json({ error: 'internal_error' }, 500);
});

// static assets from the built client
app.get('*', async (c, next) => {
  const p = c.req.path;
  if (p.startsWith('/api/')) return next();
  if (p === '/' || p.includes('.')) {
    const filePath = path.join(DIST, p === '/' ? 'index.html' : p);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
      return c.body(fs.readFileSync(filePath), 200, { 'content-type': types[ext] || 'application/octet-stream' });
    }
    if (p.includes('.')) return c.text('Not found', 404);
  }
  const index = path.join(DIST, 'index.html');
  if (fs.existsSync(index)) return c.html(fs.readFileSync(index, 'utf8'));
  return next();
});

async function start() {
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt++) {
    try {
      await runSeed();
      ready = true;
    } catch (e) {
      console.error('[start] seed attempt failed:', e.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!ready) {
    console.error('[start] could not seed; exiting');
    process.exit(1);
  }
  const server = serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
    console.log('[ravel] listening on 0.0.0.0:' + info.port);
  });
  const shutdown = () => {
    server.close();
    pool.end().then(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();
