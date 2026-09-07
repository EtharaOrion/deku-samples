import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { ENV } from './env.js';
import { pool } from './db.js';
import { applySchema, seedIfEmpty } from './seed.js';
import { authRoutes, accountRoutes } from './routes/auth.js';
import { eventRoutes } from './routes/events.js';
import { registrationRoutes } from './routes/registrations.js';
import { ticketRoutes } from './routes/tickets.js';
import { calendarRoutes } from './routes/calendars.js';
import { guestListRoutes } from './routes/guestlist.js';
import { rootRoutes } from './routes/root.js';
import { buildThemeVars, escapeHtml } from './ssr.js';

const app = new Hono();

app.use('*', async (c, next) => {
  const started = Date.now();
  await next();
  if (!c.req.path.startsWith('/api')) return;
  console.log(
    JSON.stringify({
      level: 'info',
      scope: 'http',
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
      ts: new Date().toISOString(),
    }),
  );
});

app.get('/api/health', async (c) => {
  try {
    await pool.query('SELECT 1');
    return c.json({ status: 'ok', ts: new Date().toISOString() });
  } catch {
    return c.json({ status: 'starting' }, 503);
  }
});

app.route('/api/auth', authRoutes);
app.route('/api/accounts', accountRoutes);
app.route('/api/events', guestListRoutes);
app.route('/api/events', eventRoutes);
app.route('/api/registrations', registrationRoutes);
app.route('/api/tickets', ticketRoutes);
app.route('/api/calendars', calendarRoutes);
app.route('/api/resolve', rootRoutes);

app.get('/api/ics/:slug', async (c) => {
  const slug = c.req.param('slug');
  const { rows } = await pool.query(
    `SELECT e.*, c.name AS calendar_name FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE e.slug = $1`,
    [slug],
  );
  const row = rows[0];
  if (!row) return c.json({ message: 'That event does not exist.' }, 404);
  const { icsFor } = await import('./time.js');
  const body = icsFor({
    uid: `${row.slug}@deku.events`,
    title: row.title,
    description: String(row.description ?? ''),
    location: `${row.city}`,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    url: `${ENV.publicUrl}/${row.slug}`,
  });
  c.header('Content-Type', 'text/calendar; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${row.slug}.ics"`);
  return c.body(body);
});

app.all('/api/*', (c) => c.json({ message: 'That endpoint does not exist.' }, 404));

// ---- Static shell + SSR paint -------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WEB_DIST = process.env.WEB_DIST || join(process.cwd(), 'web-dist');
const INDEX_HTML = join(WEB_DIST, 'index.html');

function shell(extraHead: string, bodyVars: string): string {
  const html = readFileSync(INDEX_HTML, 'utf8');
  return html
    .replace('<!--#THEME#-->', extraHead)
    .replace('/*#BOOTVARS#*/', bodyVars);
}

app.use('*', async (c, next) => {
  const path = decodeURIComponent(c.req.path);
  if (path.startsWith('/api')) return next();

  const trimmed = path.replace(/^\/+|\/+$/g, '');
  const parts = trimmed.split('/').filter(Boolean);

  // Static assets first.
  if (parts.length === 1 && /^[\w.-]+\.(js|css|svg|png|jpg|jpeg|webp|ico|txt|woff2?)$/.test(parts[0])) {
    const file = join(WEB_DIST, parts[0]);
    if (existsSync(file)) {
      const ext = parts[0].split('.').pop() as string;
      const types: Record<string, string> = {
        js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
        jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', txt: 'text/plain',
        woff: 'font/woff', woff2: 'font/woff2',
      };
      const buf = readFileSync(file);
      return c.body(buf as any, 200, {
        'Content-Type': types[ext] ?? 'application/octet-stream',
        'Cache-Control': ext === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
    }
  }

  const themeHeadFor = (themeHex: string | null) =>
    themeHex ? `<style id="event-theme-inline">${buildThemeVars(themeHex)}</style>` : '';

  // /event/<slug> and /t/<code>: the theme must be in the first document.
  if (parts[0] === 'event' && parts[1] && parts.length === 2) {
    const slug = parts[1];
    const { rows } = await pool
      .query(
        `SELECT e.theme_hex, e.state, c.owner_account_id FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE e.slug = $1`,
        [slug],
      )
      .catch(() => ({ rows: [] as any[] }));
    const row = rows[0];
    if (row && row.state !== 'draft') {
      return c.html(shell(themeHeadFor(row.theme_hex), ''));
    }
    return c.html(shell('', ''));
  }
  if (parts[0] === 't' && parts[1] && parts.length === 2) {
    const code = parts[1];
    const { rows } = await pool
      .query(
        `SELECT e.theme_hex FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.ticket_code = $1`,
        [code],
      )
      .catch(() => ({ rows: [] as any[] }));
    const row = rows[0];
    return c.html(shell(row ? themeHeadFor(row.theme_hex) : '', ''));
  }

  // Everything else: the plain shell.
  return c.html(shell('', ''));
});

const server = serve({ fetch: app.fetch, port: ENV.port, hostname: '0.0.0.0' }, async (info) => {
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt++) {
    try {
      await applySchema();
      const seeded = await seedIfEmpty();
      ready = true;
      console.log(
        JSON.stringify({
          level: 'info',
          scope: 'boot',
          message: `listening on 0.0.0.0:${info.port}`,
          seeded: seeded.seeded,
          publicUrl: ENV.publicUrl,
          ts: new Date().toISOString(),
        }),
      );
    } catch (err) {
      if (attempt === 29) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
});
