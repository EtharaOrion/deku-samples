import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { env } from './env.js';
import { log } from './log.js';
import { pool, query, waitForDb } from './db.js';
import { CONSTRAINTS_SQL, SCHEMA_SQL } from './schema.js';
import { seed } from './seed.js';
import { ApiError, errorBody, optionalAuth, type Vars } from './http.js';
import { authRoutes } from './routes/auth.js';
import { accountRoutes, calendarRoutes } from './routes/accounts.js';
import { eventRoutes } from './routes/events.js';
import { registrationRoutes, ticketRoutes } from './routes/registrations.js';
import { publicRoutes, resolveRoutes, resolveSlug } from './routes/resolve.js';
import { deriveTheme } from './domain.js';
import { verifyMailTransport } from './mail.js';
import { safeJoin, streamAsset } from './static.js';

const STATIC_ROOT = resolve(env.staticDir);

const app = new Hono<{ Variables: Vars }>();

app.use('*', async (c, next) => {
  const started = Date.now();
  await next();
  if (c.req.path.startsWith('/api')) {
    log.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
    });
  }
});

const api = new Hono<{ Variables: Vars }>();
api.use('*', optionalAuth);

api.get('/health', async (c) => {
  try {
    await query('SELECT 1');
    return c.json({ status: 'ok', ready: true });
  } catch {
    return c.json({ status: 'degraded', ready: false }, 503);
  }
});

api.route('/auth', authRoutes);
api.route('/accounts', accountRoutes);
api.route('/calendars', calendarRoutes);
api.route('/events', eventRoutes);
api.route('/registrations', registrationRoutes);
api.route('/tickets', ticketRoutes);
api.route('/resolve', resolveRoutes);
api.route('/', publicRoutes);

api.all('*', (c) => c.json({ message: 'That endpoint does not exist.' }, 404));

api.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json(errorBody(err), err.status as any);
  }
  log.error('unhandled api failure', { path: c.req.path, err: String(err), stack: (err as Error).stack });
  return c.json({ message: 'Something went wrong on our side. Try again in a moment.' }, 500);
});

app.route('/api', api);

// ---------------------------------------------------------------------------
// Static shell, with the event theme present in the first document painted.
// ---------------------------------------------------------------------------

let shellHtml = '';

async function loadShell(): Promise<string> {
  if (!shellHtml) {
    shellHtml = await readFile(resolve(STATIC_ROOT, 'index.html'), 'utf8');
  }
  return shellHtml;
}

function escapeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

interface Bootstrap {
  theme?: ReturnType<typeof deriveTheme>;
  event?: Record<string, unknown>;
  kind?: string;
}

async function bootstrapFor(path: string): Promise<Bootstrap | null> {
  const parts = path.split('/').filter(Boolean);

  const eventBySlug = async (slug: string) => {
    const r = await query(
      `SELECT e.slug, e.title, e.theme_hex, e.cover_seed, e.state, e.starts_at, e.ends_at, e.city,
              e.time_zone, e.category, e.description, e.capacity,
              c.name AS calendar_name, c.slug AS calendar_slug
         FROM events e JOIN calendars c ON c.id = e.calendar_id
        WHERE e.slug = $1 AND e.state <> 'draft'`,
      [slug],
    );
    return r.rows[0] ?? null;
  };

  if (parts.length === 1) {
    const found = await resolveSlug(parts[0]);
    if (found?.kind === 'event') {
      const ev = await eventBySlug(found.slug);
      if (ev) return { kind: 'event', event: ev, theme: deriveTheme(ev.theme_hex) };
    }
    if (found) return { kind: found.kind };
    return null;
  }

  if (parts.length === 2 && parts[0] === 't') {
    const r = await query(
      `SELECT e.slug, e.title, e.theme_hex FROM registrations r
         JOIN events e ON e.id = r.event_id WHERE r.ticket_code = $1`,
      [parts[1].toUpperCase()],
    );
    const row = r.rows[0];
    if (row) return { kind: 'ticket', event: row, theme: deriveTheme(row.theme_hex) };
    return null;
  }

  if (parts.length >= 2 && parts[0] === 'event') {
    const ev = await eventBySlug(parts[1]);
    if (ev) return { kind: 'manage', event: ev, theme: deriveTheme(ev.theme_hex) };
  }

  return null;
}

function themeStyle(theme: ReturnType<typeof deriveTheme>): string {
  return [
    `--event-key:${theme.key}`,
    `--event-ground:${theme.ground}`,
    `--event-sunk:${theme.sunk}`,
    `--event-ink:${theme.ink}`,
    `--event-ink-secondary:${theme.inkSecondary}`,
    `--event-hairline:${theme.hairline}`,
    `--event-panel:${theme.panel}`,
  ].join(';');
}

async function renderShell(path: string): Promise<Response> {
  let html = await loadShell();
  let boot: Bootstrap | null = null;
  try {
    boot = await bootstrapFor(path);
  } catch (e) {
    log.warn('bootstrap lookup failed', { path, err: String(e) });
  }

  if (boot?.theme) {
    // The key colour is written into the document the browser first paints, so
    // the page arrives already wearing it rather than repainting on data. The
    // attributes are added to whatever <html ...> tag the builder produced.
    html = html.replace(
      /<html\b([^>]*)>/i,
      (_m, attrs: string) =>
        `<html${attrs} data-event-theme="on" style="${themeStyle(boot!.theme!)}">`,
    );
    html = html.replace(
      '</head>',
      `<style id="event-theme-boot">html,body{background:${boot.theme.ground};color:${boot.theme.ink};}</style></head>`,
    );
  }

  const payload = boot ? { kind: boot.kind, event: boot.event ?? null, theme: boot.theme ?? null } : null;
  html = html.replace(
    '</head>',
    `<script id="bootstrap-data" type="application/json">${escapeJson(payload)}</script></head>`,
  );

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
  });
}

app.get('*', async (c) => {
  const path = new URL(c.req.url).pathname;
  if (path !== '/' && !path.endsWith('/')) {
    const file = safeJoin(STATIC_ROOT, path);
    if (file) {
      const asset = await streamAsset(file);
      if (asset) return asset;
    }
  }
  return renderShell(path);
});

app.onError((err, c) => {
  log.error('unhandled failure', { path: c.req.path, err: String(err) });
  return c.text('Something went wrong on our side.', 500);
});

async function migrate(): Promise<void> {
  // Only one container instance may apply the schema at a time.
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(918273645)');
    await client.query(SCHEMA_SQL);
    await client.query(CONSTRAINTS_SQL);
    log.info('schema applied');
  } finally {
    await client.query('SELECT pg_advisory_unlock(918273645)').catch(() => {});
    client.release();
  }
}

async function main(): Promise<void> {
  await waitForDb();
  await migrate();
  await seed();
  await verifyMailTransport();
  await loadShell().catch((e) => {
    log.error('application shell missing', { root: STATIC_ROOT, err: String(e) });
    throw e;
  });

  serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) => {
    log.info('listening', { host: env.host, port: info.port, public_url: env.publicUrl });
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info('shutting down', { signal });
    pool.end().finally(() => process.exit(0));
  });
}

main().catch((e) => {
  log.error('startup failed', { err: String(e), stack: (e as Error).stack });
  process.exit(1);
});
