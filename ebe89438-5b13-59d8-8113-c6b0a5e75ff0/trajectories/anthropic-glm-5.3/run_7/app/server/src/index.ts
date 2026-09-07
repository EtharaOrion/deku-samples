import { serve } from '@hono/node-server';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { Hono } from 'hono';
import { makePool, migrate } from './db.js';
import type { Pool } from 'pg';
import { apiRoutes } from './api.js';
import { themeFor, themeCss } from './theme.js';
import { RESERVED_PATHS, CATEGORIES } from './constants.js';
import { log } from './log.js';

const PORT = Number(process.env.PORT || 4173);
const WEB_DIST = process.env.WEB_DIST || join(process.cwd(), 'web', 'dist', 'web', 'browser');
const INDEX_HTML = join(WEB_DIST, 'index.html');

const pool = makePool();
const app = new Hono<{ Variables: { db: Pool } }>();

app.use('*', async (c, next) => {
  c.set('db', pool as any);
  const start = Date.now();
  await next();
  log.info('request', {
    method: c.req.method, path: c.req.path,
    status: c.res.status, ms: Date.now() - start,
  });
});

app.route('/api', apiRoutes(pool));

app.get('/api/health', async (c) => {
  try {
    await pool.query('SELECT 1');
    return c.json({ status: 'ok' });
  } catch {
    return c.json({ status: 'unavailable' }, 503);
  }
});

/* ------------------------- static assets + shell ------------------------ */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

let indexCache: string | null = null;
function readIndex(): string {
  if (!indexCache) indexCache = readFileSync(INDEX_HTML, 'utf8');
  return indexCache;
}

/**
 * The event theme must be present in the first document the browser paints,
 * so the shell is served with the event's palette already inlined. Data still
 * arrives over the JSON API; this is only the paint.
 */
async function shellFor(pathname: string): Promise<string> {
  const html = readIndex();
  const slug = pathname.replace(/^\//, '').replace(/\/$/, '').split('/')[0];
  let injected = '';
  if (slug && !RESERVED_PATHS.has(slug) && !(CATEGORIES as readonly string[]).includes(slug)) {
    try {
      const { rows } = await pool.query(
        `SELECT e.theme_hex, e.state, c.owner_account_id AS owner, c.is_public
         FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE e.slug = $1`, [slug]);
      const e = rows[0];
      if (e && e.state !== 'draft') {
        injected = themeCss(themeFor(e.theme_hex)) +
          `<meta name="event-theme" content="${e.theme_hex}">`;
      } else if (e && e.state === 'draft') {
        injected = themeCss(themeFor(e.theme_hex)) + `<meta name="event-theme" content="${e.theme_hex}">`;
      }
    } catch {
      /* the shell is still served; the API decides visibility */
    }
  }
  if (pathname.startsWith('/t/')) {
    const code = decodeURIComponent(pathname.slice(3).split('/')[0] || '').toUpperCase();
    try {
      const { rows } = await pool.query(
        `SELECT e.theme_hex FROM registrations r JOIN events e ON e.id = r.event_id
         WHERE upper(r.ticket_code) = $1 AND r.status IN ('confirmed','checked_in')`, [code]);
      if (rows[0]) injected = themeCss(themeFor(rows[0].theme_hex)) + `<meta name="event-theme" content="${rows[0].theme_hex}">`;
    } catch { /* ignore */ }
  }
  if (!injected) return html;
  return html.replace('</head>', `<style id="event-theme">${injected}</style></head>`);
}

app.get('*', async (c) => {
  const pathname = decodeURIComponent(new URL(c.req.url).pathname);
  const clean = pathname.replace(/\\/g, '/');

  // Angular's hashed assets live flat under the browser root.
  if (!clean.startsWith('/t/') && clean.includes('.')) {
    const file = join(WEB_DIST, clean.replace(/^\//, ''));
    if (existsSync(file) && statSync(file).isFile() && file.startsWith(WEB_DIST)) {
      const body = readFileSync(file);
      const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
      return c.body(body, 200, {
        'Content-Type': type,
        'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
    }
  }

  const html = await shellFor(clean);
  return c.html(html, 200, { 'Cache-Control': 'no-cache' });
});

/* --------------------------------- boot --------------------------------- */

async function main() {
  log.info('boot', { port: PORT, web_dist: WEB_DIST, db: maskUrl(process.env.DATABASE_URL || '') });
  await migrate(pool);
  const server = serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
    log.info('listening', { address: info.address, port: info.port });
  });
  const shutdown = async () => {
    log.info('shutdown');
    server.close();
    await pool.end().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function maskUrl(u: string): string {
  return u.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

main().catch((e) => {
  log.error('fatal', { message: e?.message, stack: e?.stack });
  process.exit(1);
});
