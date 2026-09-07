import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import pg from 'pg';
import { config } from './config.js';
import { migrate } from './schema.js';
import { seed } from './seed.js';
import { authMiddleware } from './auth.js';
import { authRoutes, accountRoutes } from './routes/auth.js';
import { eventRoutes } from './routes/events.js';
import { registrationRoutes, ticketRoutes } from './routes/registrations.js';
import { calendarRoutes } from './routes/calendars.js';
import { resolveRoutes } from './routes/resolve.js';
import { jsonError } from './errors.js';
import { verifySmtp } from './mail.js';
import { themedShell } from './shell-theme.js';
import { log } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../../web-dist');

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
});

const api = new Hono();

api.onError((err, c) => jsonError(c, err));

api.get('/health', async (c) => {
  try {
    await pool.query('select 1');
    return c.json({ status: 'ok', time: new Date().toISOString() });
  } catch {
    return c.json({ status: 'starting' }, 503);
  }
});

api.route('/auth', authRoutes);
api.route('/accounts', accountRoutes);
api.route('/events', eventRoutes);
api.route('/registrations', registrationRoutes);
api.route('/tickets', ticketRoutes);
api.route('/calendars', calendarRoutes);
api.route('/resolve', resolveRoutes);

const app = new Hono();
app.use('*', authMiddleware);
app.route('/api', api);

/* ---- static shell ---- */

const shellHtml = fs.existsSync(path.join(WEB_ROOT, 'index.html'))
  ? fs.readFileSync(path.join(WEB_ROOT, 'index.html'), 'utf8')
  : '<!doctype html><title>Starting</title><p>The app is starting.</p>';

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.includes('..')) pathname = '/';
  const filePath = path.join(WEB_ROOT, pathname);
  if (!filePath.startsWith(WEB_ROOT)) return c.notFound();
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const headers: Record<string, string> = {
      'content-type': mime[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    };
    return c.body(fs.readFileSync(filePath), 200, headers);
  }
  // SPA history fallback, themed for the address when it names an event.
  const html = await themedShell(shellHtml, pathname);
  return c.body(html, 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
});

async function start(): Promise<void> {
  let ready = false;
  for (let attempt = 1; attempt <= 30 && !ready; attempt++) {
    try {
      await pool.query('select 1');
      ready = true;
    } catch (err) {
      log({ level: 'warn', msg: 'database not ready', attempt, error: String(err) });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!ready) {
    log({ level: 'fatal', msg: 'database unreachable' });
    process.exit(1);
  }

  await migrate(pool);
  await seed(pool);
  await verifySmtp();

  serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    log({ level: 'info', msg: 'listening', port: info.port, host: config.host, publicUrl: config.publicUrl });
  });
}

start().catch((err) => {
  log({ level: 'fatal', msg: 'start failed', error: String(err), stack: err?.stack });
  process.exit(1);
});
