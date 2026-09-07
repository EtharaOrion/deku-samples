import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env, log } from './env.js';
import { migrate, query, waitForDb } from './db.js';
import { seed } from './seed.js';
import { syncReservations } from './namespace.js';
import { attachAccount } from './auth.js';
import { AppError } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { eventRoutes } from './routes/events.js';
import { registrationRoutes } from './routes/registrations.js';
import { accountRoutes, calendarRoutes, categoryRoutes, resolveRoutes, ticketRoutes } from './routes/misc.js';
import { deriveTheme, themeCssVars } from './theme.js';
import { verifyMailer } from './mailer.js';

const app = new Hono();

app.use('*', async (c, next) => {
  const started = Date.now();
  await next();
  log('info', 'request', {
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    ms: Date.now() - started,
  });
});

const api = new Hono();
api.use('*', attachAccount);

api.get('/health', async (c) => {
  try {
    await query('SELECT 1');
    return c.json({ status: 'ok', ready: true });
  } catch {
    return c.json({ status: 'degraded', ready: false }, 503);
  }
});

api.route('/auth', authRoutes);
api.route('/events', eventRoutes);
api.route('/registrations', registrationRoutes);
api.route('/tickets', ticketRoutes);
api.route('/calendars', calendarRoutes);
api.route('/accounts', accountRoutes);
api.route('/resolve', resolveRoutes);
api.route('/categories', categoryRoutes);

api.notFound((c) => c.json({ message: 'Page Not Found', code: 'not_found' }, 404));

api.onError((err, c) => {
  const anyErr = err as any;
  const status = anyErr.status && Number.isInteger(anyErr.status) ? anyErr.status : 500;
  if (status >= 500) {
    log('error', 'unhandled', { err: String(err), stack: anyErr.stack });
    return c.json({ message: 'Something went wrong on our side. Try again in a moment.', code: 'internal' }, 500);
  }
  const body: Record<string, unknown> = {
    message: err.message,
    code: anyErr.code || 'request_refused',
  };
  if (anyErr.field) body.field = anyErr.field;
  if (anyErr.extra) Object.assign(body, anyErr.extra);
  return c.json(body, status as any);
});

app.route('/api', api);

// ---------------------------------------------------------------- static shell

const staticRoot = path.resolve(env.staticDir);
let shellHtml = '';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
};

async function loadShell() {
  shellHtml = await readFile(path.join(staticRoot, 'index.html'), 'utf8');
}

const RESERVED = new Set(['api', 'app', 'login', 'signup', 'home', 'calendars', 'create', 'discover', 'settings', 'event', 't']);

/** Works out which event, if any, a route is about, so its palette ships in the shell. */
async function eventSlugForPath(pathname: string): Promise<string | null> {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  if (parts[0] === 'event' && parts[1]) return parts[1];
  if (parts[0] === 't' && parts[1]) {
    const r = await query('SELECT e.slug FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.ticket_code = $1', [parts[1].toUpperCase()]);
    return r.rows[0]?.slug ?? null;
  }
  if (parts.length === 1 && !RESERVED.has(parts[0])) return parts[0];
  return null;
}

function injectTheme(html: string, tokens: ReturnType<typeof deriveTheme>, slug: string): string {
  const vars = themeCssVars(tokens);
  const style = `<style id="event-theme-boot">:root{${vars}}html.event-themed,html.event-themed body{background:${tokens.ground};color:${tokens.ink};}</style>`;
  const data = `<script id="event-theme-data" type="application/json">${
    JSON.stringify({ slug, ...tokens }).replace(/</g, '\\u003c')
  }</script>`;
  return html
    .replace('<html', '<html class="event-themed"')
    .replace('</head>', `${style}${data}</head>`);
}

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api')) {
    return c.json({ message: 'Page Not Found', code: 'not_found' }, 404);
  }

  // a real file wins
  if (pathname !== '/' && !pathname.endsWith('/')) {
    const filePath = path.join(staticRoot, pathname);
    if (filePath.startsWith(staticRoot)) {
      try {
        const s = await stat(filePath);
        if (s.isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const immutable = /-[A-Z0-9]{8,}\./i.test(path.basename(filePath));
          return new Response(Readable.toWeb(createReadStream(filePath)) as any, {
            headers: {
              'Content-Type': MIME[ext] || 'application/octet-stream',
              'Content-Length': String(s.size),
              'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
            },
          });
        }
      } catch { /* fall through to the shell */ }
    }
  }

  let html = shellHtml;
  try {
    const slug = await eventSlugForPath(pathname);
    if (slug) {
      const r = await query('SELECT slug, theme_hex, state FROM events WHERE slug = $1', [slug]);
      const ev = r.rows[0];
      if (ev) html = injectTheme(html, deriveTheme(ev.theme_hex), ev.slug);
    }
  } catch (e) {
    log('warn', 'theme injection skipped', { err: String(e) });
  }

  return c.html(html, 200, { 'Cache-Control': 'no-cache' });
});

async function main() {
  log('info', 'starting', { port: env.port, host: env.host, staticRoot });
  await waitForDb();
  await migrate();
  await seed();
  await syncReservations();
  await loadShell();
  await verifyMailer();

  serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) => {
    log('info', 'listening', { address: info.address, port: info.port });
  });
}

main().catch((e) => {
  log('error', 'failed to start', { err: String(e), stack: (e as any)?.stack });
  process.exit(1);
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    log('info', 'shutting down', { sig });
    process.exit(0);
  });
}
