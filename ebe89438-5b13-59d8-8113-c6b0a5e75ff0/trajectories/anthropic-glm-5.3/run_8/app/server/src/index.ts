import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { config, log, pool } from './config.js';
import { migrate } from './db.js';
import { runSeed } from './seed.js';
import { withTransaction } from './db.js';
import api from './api.js';
import { errorHandler } from './http.js';
import { classify } from './namespace.js';
import { themeFromHex } from './theme.js';

const app = new Hono();
app.onError(errorHandler);

app.route('/api', api);

// ---- static assets and the application shell ----
const distDir = process.env.STATIC_DIR || join(config.appRoot, 'frontend', 'dist', 'browser');
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
};

function readIndex(): string {
  return readFileSync(join(distDir, 'index.html'), 'utf8');
}

interface EventMeta { slug: string; title: string; theme_hex: string; state: string }

async function eventMetaForDocument(slug: string): Promise<EventMeta | null> {
  try {
    const res = await pool.query<EventMeta>(
      `SELECT slug, title, theme_hex, state FROM events WHERE slug = $1`, [slug],
    );
    return res.rows[0] ?? null;
  } catch {
    return null;
  }
}

function decorateIndex(html: string, meta: EventMeta | null, isEventDoc: boolean): string {
  if (!isEventDoc || !meta) return html;
  const t = themeFromHex(meta.theme_hex);
  const vars = [
    `--ev-key:${t.key}`,
    `--ev-ground:${t.ground}`,
    `--ev-ground-sunk:${t.groundSunk}`,
    `--ev-ink:${t.ink}`,
    `--ev-ink-rgb:${hexToRgbTriplet(t.ink)}`,
    `--ev-theme-ready:1`,
  ].join(';');
  const tag = `<style id="event-theme">:root{${vars}}</style><meta name="gather-event" content="${meta.slug}">`;
  const withTag = html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : html + tag;
  const themed = `<meta name="gather-themed" content="1">`;
  return withTag.replace('</head>', `${themed}</head>`);
}

function hexToRgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

function serveAsset(path: string): Response | null {
  const safe = path.replace(/^\/+/, '');
  const full = join(distDir, safe);
  if (!full.startsWith(distDir)) return null;
  if (!existsSync(full) || !statSync(full).isFile()) return null;
  const type = mime[extname(full)] ?? 'application/octet-stream';
  const cache = full.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  return new Response(readFileSync(full), { headers: { 'Content-Type': type, 'Cache-Control': cache } });
}

// The event page must arrive already wearing its colour: resolve /<slug> server-side.
const EVENTISH = /^\/event\/([^/]+)$/;
const TICKET = /^\/t\/([^/]+)$/;

app.all('/api/*', (c) => c.notFound());
app.all('/api', (c) => c.notFound());

app.get('*', async (c) => {
  const path = c.req.path;

  if (path === '/' || path === '') {
    const asset = serveAsset('index.html');
    return asset ?? c.notFound();
  }
  if (EVENTISH.test(path) || TICKET.test(path)) {
    const m = EVENTISH.exec(path);
    const slug = m ? m[1] : TICKET.exec(path)![1];
    const isEventDoc = Boolean(m);
    let meta: EventMeta | null = null;
    if (isEventDoc) meta = await eventMetaForDocument(slug);
    if (!isEventDoc) {
      // A ticket document themes from its event once the client loads it; the
      // shell stays neutral so no wrong colour is ever painted first.
      const asset = serveAsset('index.html');
      return asset ?? c.notFound();
    }
    if (meta && meta.state === 'draft') meta = null; // a draft is invisible to strangers
    const html = decorateIndex(readIndex(), meta, true);
    return c.html(html);
  }
  if (path.startsWith('/event/') || path.startsWith('/settings') || path.startsWith('/home') ||
      path.startsWith('/calendars') || path.startsWith('/create') || path.startsWith('/discover') ||
      path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/app') ||
      path === '/legal' || path.startsWith('/suspended')) {
    const asset = serveAsset('index.html');
    return asset ?? c.notFound();
  }
  // Root namespace: reserved, category, then events, calendars, accounts.
  const slug = decodeURIComponent(path.replace(/^\/+|\/+$/g, ''));
  if (slug && !slug.includes('/')) {
    const kind = classify(slug);
    if (kind === 'system' || kind === 'category') {
      const asset = serveAsset('index.html');
      return asset ?? c.notFound();
    }
    const meta = await eventMetaForDocument(slug);
    if (meta && meta.state !== 'draft') {
      const html = decorateIndex(readIndex(), meta, true);
      return c.html(html);
    }
  }
  const asset = serveAsset(path);
  if (asset) return asset;
  const index = serveAsset('index.html');
  return index ?? c.notFound();
});

async function bootstrap(): Promise<void> {
  log('boot', { port: config.port, appUrl: config.appUrl });
  let ready = false;
  for (let attempt = 1; attempt <= 40 && !ready; attempt++) {
    try {
      await pool.query('SELECT 1');
      ready = true;
    } catch (err) {
      log('db_wait', { attempt, message: err instanceof Error ? err.message : String(err) });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!ready) throw new Error('database never became reachable');
  await migrate(pool);
  await withTransaction(async (tx) => {
    await runSeed(tx);
  });
  log('ready', {});
}

bootstrap().catch((err) => {
  log('boot_failed', { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  log('listening', { port: info.port, address: info.address });
});

process.on('SIGTERM', () => {
  log('shutdown', {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
});
