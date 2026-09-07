import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env, log } from './env.js';
import { migrate, pool, waitForDb } from './db.js';
import { seed } from './seed.js';
import { api } from './api.js';
import { CATEGORIES, RESERVED_PATHS, deriveTheme } from './core.js';
import { verifyMailTransport } from './mail.js';

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

app.route('/api', api);

// ------------------------------------------------------------ static files
const STATIC_DIR = env.staticDir || path.resolve(process.cwd(), '../web/dist/web/browser');

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
  '.webmanifest': 'application/manifest+json',
};

let indexHtmlCache: string | null = null;
async function indexHtml(): Promise<string> {
  if (indexHtmlCache === null) {
    indexHtmlCache = await readFile(path.join(STATIC_DIR, 'index.html'), 'utf8');
  }
  return indexHtmlCache;
}

/**
 * The theming layer computes an event's whole palette on the server and hands
 * it to the shell as tokens in the first document, so a themed page arrives
 * already wearing its colours instead of painting grey and repainting.
 */
async function themedIndex(themeHex: string, title: string | null): Promise<string> {
  const html = await indexHtml();
  const t = deriveTheme(themeHex);
  const style =
    `<style id="event-theme">:root{` +
    `--event-key:${t.key};--event-ground:${t.ground};--event-ground-sunk:${t.groundSunk};` +
    `--event-ink:${t.ink};--event-ink-secondary:${t.inkSecondary};` +
    `--event-hairline:${t.hairline};--event-panel:${t.panel};` +
    `--event-too-pale:${t.tooPale ? 1 : 0};}` +
    `body{background:var(--event-ground);}</style>` +
    `<script id="event-theme-data" type="application/json">${
      JSON.stringify(t).replace(/</g, '\\u003c')
    }</script>`;
  let out = html.replace('</head>', `${style}</head>`);
  if (title) {
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)} · Deku Events</title>`);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ));
}

async function serveFile(c: any, filePath: string) {
  const s = await stat(filePath);
  if (!s.isFile()) return null;
  const ext = path.extname(filePath).toLowerCase();
  const stream = createReadStream(filePath);
  const headers: Record<string, string> = {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': String(s.size),
  };
  // Hashed build output is immutable; the shell must never be cached.
  if (/-[A-Z0-9]{8,}\.(js|css|woff2?)$/i.test(path.basename(filePath))) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  } else {
    headers['Cache-Control'] = 'no-cache';
  }
  return new Response(Readable.toWeb(stream) as ReadableStream, { headers });
}

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api')) {
    return c.json({ message: 'Not found.' }, 404);
  }

  // A real file wins over the shell.
  if (pathname !== '/' && !pathname.endsWith('/')) {
    const rel = pathname.replace(/^\/+/, '');
    const resolved = path.resolve(STATIC_DIR, rel);
    if (resolved.startsWith(path.resolve(STATIC_DIR))) {
      try {
        const res = await serveFile(c, resolved);
        if (res) return res;
      } catch {
        /* fall through to the shell */
      }
    }
  }

  // Root-namespace resolution decides whether this document arrives themed.
  const segments = pathname.split('/').filter(Boolean);
  let themeHex: string | null = null;
  let title: string | null = null;

  try {
    if (segments.length === 1 && !RESERVED_PATHS.includes(segments[0]) && !CATEGORIES.includes(segments[0])) {
      const r = await pool.query(
        `SELECT e.theme_hex, e.title, e.state, cal.owner_account_id
           FROM events e JOIN calendars cal ON cal.id = e.calendar_id
          WHERE e.slug = $1`,
        [segments[0]],
      );
      if (r.rowCount && r.rows[0].state !== 'draft') {
        themeHex = r.rows[0].theme_hex;
        title = r.rows[0].title;
      }
    } else if (segments.length === 2 && segments[0] === 't') {
      const r = await pool.query(
        `SELECT e.theme_hex, e.title FROM registrations r
           JOIN events e ON e.id = r.event_id
          WHERE r.ticket_code = $1`,
        [segments[1].toUpperCase()],
      );
      if (r.rowCount) {
        themeHex = r.rows[0].theme_hex;
        title = r.rows[0].title;
      }
    } else if (segments.length >= 2 && segments[0] === 'event') {
      const r = await pool.query('SELECT theme_hex, title FROM events WHERE slug = $1', [segments[1]]);
      if (r.rowCount) title = r.rows[0].title;
    }
  } catch (e) {
    log('warn', 'theme lookup failed', { err: String(e) });
  }

  const body = themeHex ? await themedIndex(themeHex, title) : await indexHtml();
  return c.html(body);
});

// ------------------------------------------------------------------- start
async function main() {
  log('info', 'starting', { staticDir: STATIC_DIR, port: env.port });
  await waitForDb();
  await migrate();
  await seed();
  await verifyMailTransport();

  serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) => {
    log('info', 'listening', { address: env.host, port: info.port });
  });
}

const shutdown = (signal: string) => {
  log('info', 'shutting down', { signal });
  pool.end().finally(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  log('error', 'unhandled rejection', { reason: String(reason) });
});

main().catch((e) => {
  log('error', 'failed to start', { err: String(e), stack: (e as Error).stack });
  process.exit(1);
});
