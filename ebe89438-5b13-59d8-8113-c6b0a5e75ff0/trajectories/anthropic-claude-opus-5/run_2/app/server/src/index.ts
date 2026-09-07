import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, pool, waitForDatabase } from './db.js';
import { AppContext, NOT_FOUND_BODY } from './http.js';
import { verifyMailTransport } from './mail.js';
import { authRoutes } from './routes/auth.js';
import { eventRoutes } from './routes/events.js';
import { miscRoutes } from './routes/misc.js';
import { registrationRoutes } from './routes/registrations.js';
import { seed } from './seed.js';
import { CATEGORIES, RESERVED_PATHS, deriveTheme, log } from './util.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * WEB_ROOT is set explicitly in the image. The fallbacks cover both layouts
 * this code runs in: `<root>/dist/index.js` in the container, and
 * `<root>/server/dist/index.js` in a checkout.
 */
function findWebRoot(): string {
  if (process.env.WEB_ROOT) return process.env.WEB_ROOT;
  for (const candidate of [
    path.resolve(here, '../web-dist'),
    path.resolve(here, '../../web-dist'),
  ]) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) return candidate;
  }
  return path.resolve(here, '../web-dist');
}

const WEB_ROOT = findWebRoot();
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

const app = new Hono();

/* -------------------------------------------------------------- API routes */

const api = new Hono();
api.route('/', miscRoutes);
api.route('/', authRoutes);
api.route('/', eventRoutes);
api.route('/', registrationRoutes);
api.all('*', (c) => c.json(NOT_FOUND_BODY, 404));
app.route('/api', api);

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

/* ------------------------------------------------------- static + SPA shell */

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
};

let shellCache: string | null = null;

function shell(): string {
  if (shellCache === null) {
    shellCache = fs.readFileSync(path.join(WEB_ROOT, 'index.html'), 'utf8');
  }
  return shellCache;
}

/**
 * The theming layer computes an event's whole palette once, on the server, and
 * hands it to the document as tokens. The page therefore arrives already
 * wearing its colours rather than painting grey and repainting once data lands.
 */
function themedShell(theme: ReturnType<typeof deriveTheme>, title?: string): string {
  const style = `<style id="event-theme">:root{--event-key:${theme.key};--event-ground:${theme.ground};--event-sunk:${theme.sunk};--event-ink:${theme.ink};--event-ink-secondary:${theme.ink_secondary};--event-hairline:${theme.hairline};--event-panel:${theme.panel};}html,body{background:${theme.ground};color:${theme.ink};}</style>`;
  const preload = `<script id="event-theme-data" type="application/json">${JSON.stringify(
    theme,
  ).replace(/</g, '\\u003c')}</script>`;
  let html = shell().replace('</head>', `${style}${preload}</head>`);
  if (title) {
    html = html.replace(
      /<title>.*?<\/title>/,
      `<title>${title.replace(/[<>&]/g, '')} · Community Calendar</title>`,
    );
  }
  return html;
}

async function themeForPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  let slug: string | null = null;
  let ticket: string | null = null;

  if (parts.length === 1 && !(RESERVED_PATHS as readonly string[]).includes(parts[0])) {
    slug = parts[0];
  } else if (parts[0] === 'event' && parts[1]) {
    slug = parts[1];
  } else if (parts[0] === 't' && parts[1]) {
    ticket = parts[1];
  }

  try {
    if (slug) {
      if ((CATEGORIES as readonly string[]).includes(slug.toLowerCase())) return null;
      const { rows } = await pool.query(
        'SELECT theme_hex, title FROM events WHERE slug = $1',
        [slug.toLowerCase()],
      );
      if (rows.length) {
        return { theme: deriveTheme(rows[0].theme_hex), title: rows[0].title };
      }
    }
    if (ticket) {
      const { rows } = await pool.query(
        `SELECT e.theme_hex, e.title FROM registrations r
           JOIN events e ON e.id = r.event_id WHERE r.ticket_code = $1`,
        [ticket.toUpperCase()],
      );
      if (rows.length) {
        return { theme: deriveTheme(rows[0].theme_hex), title: rows[0].title };
      }
    }
  } catch (err) {
    log('warn', 'theme_lookup_failed', { message: (err as Error).message });
  }
  return null;
}

app.get('*', async (c: AppContext) => {
  const urlPath = decodeURIComponent(new URL(c.req.url).pathname);
  const rel = urlPath.replace(/^\/+/, '');
  const candidate = path.resolve(WEB_ROOT, rel);

  // Serve a real asset when the address names one.
  if (rel && candidate.startsWith(path.resolve(WEB_ROOT))) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) {
        const ext = path.extname(candidate).toLowerCase();
        const body = fs.readFileSync(candidate);
        c.header('Content-Type', MIME[ext] || 'application/octet-stream');
        if (/-[A-Z0-9]{8,}\./i.test(path.basename(candidate)) || ext === '.woff2') {
          c.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          c.header('Cache-Control', 'no-cache');
        }
        return c.body(body);
      }
    } catch {
      /* falls through to the application shell */
    }
  }

  const themed = await themeForPath(urlPath);
  c.header('Content-Type', 'text/html; charset=utf-8');
  c.header('Cache-Control', 'no-cache');
  return c.body(themed ? themedShell(themed.theme, themed.title) : shell());
});

/* -------------------------------------------------------------------- boot */

async function main() {
  await waitForDatabase();
  await migrate();
  await seed();
  await verifyMailTransport();

  serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
    log('info', 'listening', {
      port: info.port,
      host: HOST,
      web_root: WEB_ROOT,
      public_url: process.env.APP_PUBLIC_URL,
    });
  });
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log('info', 'shutting_down', { signal });
    pool.end().finally(() => process.exit(0));
  });
}

process.on('unhandledRejection', (reason) => {
  log('error', 'unhandled_rejection', { message: String(reason) });
});

main().catch((err) => {
  log('error', 'boot_failed', { message: err.message, stack: err.stack });
  process.exit(1);
});
