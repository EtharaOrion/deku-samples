import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { db } from './db/client.js';
import { authRoutes } from './routes/auth.js';
import { eventRoutes } from './routes/events.js';
import { registrationRoutes } from './routes/registrations.js';
import { calendarRoutes } from './routes/calendars.js';
import { accountRoutes } from './routes/accounts.js';
import { ticketRoutes } from './routes/tickets.js';
import { resolveSlug } from './lib/namespace.js';
import { seed } from './seed.js';
import { SCHEMA_SQL } from './db/schema.js';
import { deriveTheme } from './lib/util.js';

const PORT = Number(process.env.PORT || 4173);
const HOST = '0.0.0.0';
const WEB_DIST = process.env.WEB_DIST || join(import.meta.dirname, '../../web/dist/web/browser');

const log = (msg: Record<string, unknown>) => console.log(JSON.stringify({ time: new Date().toISOString(), ...msg }));

const app = new Hono();

app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  log({ level: 'info', method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - start });
});

app.get('/api/health', async (c) => {
  try {
    await db.query('SELECT 1');
    return c.json({ status: 'ok' });
  } catch {
    return c.json({ status: 'not ready' }, 503);
  }
});

app.route('/api/auth', authRoutes);
app.route('/api/events', eventRoutes);
app.route('/api/registrations', registrationRoutes);
app.route('/api/calendars', calendarRoutes);
app.route('/api/accounts', accountRoutes);
app.route('/api/tickets', ticketRoutes);

app.get('/api/resolve/:slug', async (c) => {
  const hit = await resolveSlug(c.req.param('slug'));
  if (!hit) return c.json({ message: `Page Not Found` }, 404);
  return c.json(hit);
});

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ message: `Page Not Found` }, 404);
  return serveIndex(c, null);
});

app.onError((err, c) => {
  log({ level: 'error', msg: 'unhandled', path: c.req.path, detail: String(err?.message || err) });
  if (c.req.path.startsWith('/api/')) return c.json({ message: `Something went wrong on our side. Try again in a moment.` }, 500);
  return c.text('Something went wrong.', 500);
});

/* ---------- static shell with per-event theme at first paint ---------- */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function injectTheme(html: string, theme: { key: string; ground: string; ink: string; sunk: string } | null) {
  if (!theme) return html;
  const vars = `<style id="event-theme">:root{--ev-ground:${theme.ground};--ev-sunk:${theme.sunk};--ev-ink:${theme.ink};--ev-key:${theme.key};--ev-secondary:rgba(0,15,58,.36);--ev-hairline:rgba(0,15,58,.08);--ev-panel:rgba(0,15,58,.04);}</style>`;
  return html.replace(/<\/head>/, `${vars}</head>`);
}

async function serveIndex(c: any, theme: any) {
  let html: string;
  try {
    html = readFileSync(join(WEB_DIST, 'index.html'), 'utf8');
  } catch {
    return c.text('Front end is not built yet.', 500);
  }
  return c.html(injectTheme(html, theme));
}

/** Derives the theme for a path that looks like an event slug, so the first document paints coloured. */
async function themeForPath(pathname: string): Promise<any> {
  const seg = pathname.replace(/^\//, '').split('/')[0];
  if (!seg || seg.includes('.')) return null;
  try {
    const { rows } = await db.query(`SELECT theme_hex FROM events WHERE lower(slug)=$1 AND state <> 'draft' LIMIT 1`, [seg.toLowerCase()]);
    if (!rows[0]) return null;
    const theme = deriveTheme(rows[0].theme_hex);
    return { key: rows[0].theme_hex, ground: theme.ground, ink: theme.ink, sunk: theme.sunk };
  } catch {
    return null;
  }
}

app.get('*', async (c) => {
  const pathname = decodeURIComponent(new URL(c.req.url).pathname);
  if (pathname.startsWith('/api/')) return c.notFound();
  const file = join(WEB_DIST, pathname.replace(/^\/+/, ''));
  if (pathname !== '/' && existsSync(file) && statSync(file).isFile()) {
    const ext = extname(file);
    if (MIME[ext]) {
      return c.body(readFileSync(file), 200, { 'Content-Type': MIME[ext], 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable' });
    }
  }
  const theme = await themeForPath(pathname);
  return serveIndex(c, theme);
});

async function boot() {
  const schema = SCHEMA_SQL;
  await db.query(schema);
  await seed();
  const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST });
  log({ level: 'info', msg: 'listening', port: PORT, host: HOST });
  return server;
}

boot().catch((e) => {
  log({ level: 'error', msg: 'boot_failed', detail: String(e?.message || e) });
  process.exit(1);
});
