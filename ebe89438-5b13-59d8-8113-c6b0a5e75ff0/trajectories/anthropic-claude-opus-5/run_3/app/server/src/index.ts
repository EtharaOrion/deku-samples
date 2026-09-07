import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './api.js';
import { migrate, query, waitForDb } from './db.js';
import { log } from './log.js';
import { seed } from './seed.js';
import { verifyMailReady } from './mail.js';
import { deriveTheme } from './theme.js';
import { CATEGORIES, RESERVED_PATHS } from './namespace.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = process.env.WEB_ROOT || path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

const app = new Hono();

app.use('*', async (c, next) => {
  const started = Date.now();
  await next();
  const ms = Date.now() - started;
  if (c.req.path.startsWith('/api')) {
    log.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration_ms: ms,
    });
  }
});

app.route('/api', api);

let indexHtml = '';
function loadIndex() {
  const file = path.join(WEB_ROOT, 'index.html');
  indexHtml = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '<!doctype html><title>Deku</title>';
  return indexHtml;
}

function escapeJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * The event page's key colour must already be present in the first document the
 * browser paints. The theming layer computes the whole palette on the server and
 * writes it into the shell as custom properties plus a bootstrap payload, so an
 * event page arrives already wearing its colours rather than painting grey and
 * repainting once its data arrives.
 */
function shellFor(themed: { theme: ReturnType<typeof deriveTheme>; bootstrap: unknown } | null) {
  const html = indexHtml || loadIndex();
  if (!themed) return html;
  const t = themed.theme;
  const style = `<style id="event-theme-boot">:root{--event-ground:${t.ground};--event-ground-sunk:${t.ground_sunk};--event-ink:${t.ink};--event-ink-secondary:${t.ink_secondary};--event-hairline:${t.hairline};--event-panel:${t.panel};--event-accent:${t.accent};--event-theme-hex:${t.theme_hex};}html,body{background:${t.ground};color:${t.ink};}</style>`;
  const data = `<script id="event-bootstrap" type="application/json">${escapeJson(themed.bootstrap)}</script>`;
  return html.replace('</head>', `${style}${data}</head>`);
}

async function themedBootstrapFor(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  let slug: string | null = null;
  let ticketCode: string | null = null;

  if (parts.length === 1 && !RESERVED_PATHS.includes(parts[0]) && !CATEGORIES.includes(parts[0])) {
    slug = parts[0];
  } else if (parts.length >= 2 && parts[0] === 'event') {
    slug = parts[1];
  } else if (parts.length === 2 && parts[0] === 't') {
    ticketCode = parts[1];
  }

  try {
    if (ticketCode) {
      const res = await query(
        `SELECT e.slug, e.title, e.theme_hex, e.starts_at, e.ends_at, e.time_zone, e.city, e.location,
                r.status, r.ticket_code, r.checked_in_at
           FROM registrations r JOIN events e ON e.id = r.event_id
          WHERE r.ticket_code = $1`,
        [ticketCode]
      );
      if (!res.rowCount) return null;
      const row: any = res.rows[0];
      return {
        theme: deriveTheme(row.theme_hex),
        bootstrap: { kind: 'ticket', ticket_code: row.ticket_code, theme_hex: row.theme_hex },
      };
    }
    if (slug) {
      const res = await query(
        `SELECT e.slug, e.theme_hex, e.state FROM events e WHERE e.slug = $1`,
        [slug]
      );
      if (!res.rowCount) return null;
      const row: any = res.rows[0];
      if (row.state === 'draft') return null;
      return {
        theme: deriveTheme(row.theme_hex),
        bootstrap: { kind: 'event', slug: row.slug, theme_hex: row.theme_hex },
      };
    }
  } catch (err: any) {
    log.warn('shell_theme_lookup_failed', { message: err?.message });
  }
  return null;
}

app.use(
  '/*',
  serveStatic({
    root: path.relative(process.cwd(), WEB_ROOT) || '.',
    index: '__no_index__.html',
  })
);

// The browser receives an application shell; every screen's data arrives from /api.
app.get('*', async (c) => {
  const themed = await themedBootstrapFor(new URL(c.req.url).pathname);
  return c.html(shellFor(themed));
});

async function main() {
  log.info('boot', {
    port: PORT,
    host: HOST,
    web_root: WEB_ROOT,
    public_url: process.env.APP_PUBLIC_URL,
  });
  loadIndex();

  await waitForDb();
  await migrate();
  await seed();
  await verifyMailReady();

  serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
    log.info('listening', { address: info.address, port: info.port });
  });
}

main().catch((err) => {
  log.error('boot_failed', { message: err?.message, stack: err?.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  log.error('unhandled_rejection', { message: reason?.message ?? String(reason) });
});
process.on('SIGTERM', () => {
  log.info('sigterm');
  process.exit(0);
});
