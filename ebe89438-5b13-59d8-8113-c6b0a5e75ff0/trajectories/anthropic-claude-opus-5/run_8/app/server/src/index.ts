import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { env, log } from './env.js';
import { migrate, query, waitForDb } from './db.js';
import { seed } from './seed.js';
import { api } from './api.js';
import { HttpError, RESERVED_PATHS, CATEGORIES } from './util.js';
import { deriveTheme, themeCssVars } from './theme.js';

const app = new Hono();
const STATIC_ROOT = path.resolve(env.staticDir);

app.use('*', async (c, next) => {
  const started = Date.now();
  await next();
  if (c.req.path.startsWith('/api')) {
    log('info', 'request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
    });
  }
});

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ message: err.message, field: err.field ?? null, status: err.status }, err.status as any);
  }
  const msg = String(err?.message ?? err);
  if (/check_violation|duplicate key|unique constraint|23505|23514/i.test(msg)) {
    log('warn', 'constraint refusal', { path: c.req.path, err: msg });
    return c.json({ message: 'That change conflicts with a rule this app keeps. Reload and try again.', status: 409 }, 409);
  }
  log('error', 'unhandled', { path: c.req.path, err: msg, stack: (err as Error)?.stack });
  return c.json({ message: 'Something went wrong on our side. Try again in a moment.', status: 500 }, 500);
});

app.route('/api', api);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

let indexHtml = '';
async function loadIndex(): Promise<string> {
  if (!indexHtml) indexHtml = await readFile(path.join(STATIC_ROOT, 'index.html'), 'utf8');
  return indexHtml;
}

async function themeForPath(pathname: string): Promise<string | null> {
  const parts = pathname.split('/').filter(Boolean);
  try {
    if (parts.length === 1 && !RESERVED_PATHS.includes(parts[0]) && !CATEGORIES.includes(parts[0])) {
      const r = await query<{ theme_hex: string }>("SELECT theme_hex FROM events WHERE slug = $1 AND state <> 'draft'", [parts[0]]);
      if (r.rowCount) return r.rows[0].theme_hex;
    }
    if (parts.length === 2 && parts[0] === 't') {
      const r = await query<{ theme_hex: string }>(
        'SELECT e.theme_hex FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.ticket_code = $1',
        [parts[1].toUpperCase()],
      );
      if (r.rowCount) return r.rows[0].theme_hex;
    }
    if (parts.length === 4 && parts[0] === 'event' && parts[2] === 'manage') {
      const r = await query<{ theme_hex: string }>('SELECT theme_hex FROM events WHERE slug = $1', [parts[1]]);
      if (r.rowCount) return r.rows[0].theme_hex;
    }
  } catch (e) {
    log('warn', 'theme lookup failed', { pathname, err: String(e) });
  }
  return null;
}

/** The document the browser paints first already carries the event palette. */
async function renderShell(pathname: string): Promise<string> {
  const html = await loadIndex();
  const hex = await themeForPath(pathname);
  if (!hex) return html;
  const theme = deriveTheme(hex);
  const style = `<style id="event-theme-boot">:root{${themeCssVars(theme)}}html,body{background:${theme.ground};}body.event-themed{background:${theme.ground};color:${theme.ink};}</style>`;
  const payload = `<script id="event-theme-data" type="application/json">${JSON.stringify(theme).replace(/</g, '\\u003c')}</script>`;
  return html.replace('</head>', `${style}${payload}</head>`);
}

app.get('*', async (c) => {
  const pathname = decodeURIComponent(new URL(c.req.url).pathname);
  if (pathname.startsWith('/api')) return c.json({ message: 'Not found', status: 404 }, 404);

  const rel = pathname.replace(/^\/+/, '');
  const candidate = path.resolve(STATIC_ROOT, rel);
  if (rel && candidate.startsWith(STATIC_ROOT)) {
    try {
      const s = await stat(candidate);
      if (s.isFile()) {
        const ext = path.extname(candidate);
        const buf = await readFile(candidate);
        c.header('Content-Type', MIME[ext] ?? 'application/octet-stream');
        if (/\.[0-9a-f]{8,}\./i.test(path.basename(candidate))) {
          c.header('Cache-Control', 'public, max-age=31536000, immutable');
        }
        return c.body(new Uint8Array(buf));
      }
    } catch {
      /* fall through to the shell */
    }
  }
  const html = await renderShell(pathname);
  c.header('Content-Type', 'text/html; charset=utf-8');
  c.header('Cache-Control', 'no-cache');
  return c.body(html);
});

async function main() {
  log('info', 'starting', { port: env.port, host: env.host, static: STATIC_ROOT });
  await waitForDb();
  await migrate();
  await seed();
  serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) => {
    log('info', 'listening', { port: info.port, address: info.address });
  });
}

main().catch((e) => {
  log('error', 'fatal', { err: String(e), stack: (e as Error)?.stack });
  process.exit(1);
});
