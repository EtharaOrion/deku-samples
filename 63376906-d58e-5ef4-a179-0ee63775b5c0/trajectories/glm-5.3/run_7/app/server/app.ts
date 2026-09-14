import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { db } from './dbindex.ts';
import { idempotent } from './middleware.ts';
import { publicSite } from './routes/public.js';
import { authRoutes } from './routes/auth.js';
import { referenceRoutes } from './routes/reference.js';
import { intakeRoutes } from './routes/intake.js';
import { balanceRoutes } from './routes/balance.js';
import { carbonRoutes } from './routes/carbon.js';
import { certificateRoutes } from './routes/certificates.js';
import { recordRoutes } from './routes/record.js';
import { commercialRoutes } from './routes/commercial.js';

export const app = new Hono();

app.use('*', logger());
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store', { append: false });
  await next();
});

// Every write carries a client-supplied Idempotency-Key, scoped to the route
// and the body. Sign-in is the one exchange that is not an act.
app.use('/api/*', async (c, next) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.req.method)) return next();
  if (c.req.path === '/api/auth/login') return next();
  return idempotent(c, next);
});

app.get('/api/health', async (c) => {
  try {
    await db.query('SELECT 1');
    return c.json({ status: 'ok', ready: true });
  } catch (e: any) {
    return c.json({ status: 'unavailable', ready: false }, 503);
  }
});

app.route('/api', publicSite);
app.route('/api', authRoutes);
app.route('/api', referenceRoutes);
app.route('/api', intakeRoutes);
app.route('/api', balanceRoutes);
app.route('/api', carbonRoutes);
app.route('/api', certificateRoutes);
app.route('/api', recordRoutes);
app.route('/api', commercialRoutes);

// ---- static client, served from the same origin -------------------------
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, '..', '..', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8'
};

app.get('*', (c) => {
  const url = new URL(c.req.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith('/api/')) return c.json({ error: 'not_found' }, 404);
  if (pathname === '/favicon.ico') pathname = '/favicon.svg';
  if (pathname.includes('..')) return c.text('not found', 404);
  const candidate = join(distDir, pathname);
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    const ext = pathname.slice(pathname.lastIndexOf('.'));
    const cache = ext === '.woff2' || ext === '.js' || ext === '.css' ? 'public, max-age=31536000, immutable' : 'no-cache';
    return c.body(readFileSync(candidate), 200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': cache });
  }
  const index = join(distDir, 'index.html');
  if (existsSync(index)) {
    return c.body(readFileSync(index), 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
  }
  return c.text('not found', 404);
});


app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  const status = (err as any).status || 500;
  const code = (err as any).code || (status >= 500 ? 'internal' : 'error');
  if (status >= 500) console.error(err);
  return c.json({ error: code, message: err.message }, status);
});
