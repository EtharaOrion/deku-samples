import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { env } from './env.js';
import { log } from './log.js';
import { pool, query, waitForDatabase } from './db.js';
import { SCHEMA_SQL } from './schema.js';
import { seed } from './seed.js';
import { buildApi } from './api.js';
import { HttpError } from './errors.js';
import { deriveTheme, themeCssVariables } from './theme.js';
import type { Vars } from './auth.js';
import { loadAccount } from './auth.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const staticRoot = env.staticDir || path.resolve(process.cwd(), '../web/dist/web/browser');

async function readIndexHtml(): Promise<string> {
  return readFile(path.join(staticRoot, 'index.html'), 'utf8');
}

/**
 * The event page must arrive already wearing its colours, so the palette is
 * written into the very first document the browser paints, together with the
 * event's own data, rather than being repainted once an API answer lands.
 */
async function themedIndex(themeHex: string, preload: unknown): Promise<string> {
  const html = await readIndexHtml();
  const tokens = deriveTheme(themeHex);
  const style = `<style id="event-theme">:root{${themeCssVariables(tokens)
    .split('; ')
    .map((s) => s + ';')
    .join('')}}html,body{background:${tokens.ground};}</style>`;
  const data = `<script id="preloaded-state" type="application/json">${JSON.stringify(preload).replace(
    /</g,
    '\\u003c',
  )}</script>`;
  return html.replace('</head>', `${style}${data}</head>`);
}

async function main() {
  await waitForDatabase();
  await pool.query(SCHEMA_SQL);
  log.info('schema applied');

  // The schema is required; the fixture data is not. A restart against a
  // database the app has already been used against must still come up and
  // serve, so a seed that cannot be laid down is logged rather than fatal.
  try {
    await seed();
  } catch (err) {
    log.error('seed skipped', { err: String(err) });
  }

  const app = new Hono<{ Variables: Vars }>();

  app.use('*', async (c, next) => {
    const started = Date.now();
    await next();
    log.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
    });
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(err.body(), err.status as any);
    }
    const pgErr = err as any;
    if (pgErr?.code === '23514' || /is full/.test(String(pgErr?.message ?? ''))) {
      return c.json({ message: 'This event is full.' }, 409);
    }
    if (pgErr?.code === '23505') {
      return c.json({ message: 'That is already taken.' }, 409);
    }
    log.error('unhandled', { err: String(err), stack: (err as Error).stack, path: c.req.path });
    return c.json({ message: 'Something went wrong on our side. Try again in a moment.' }, 500);
  });

  app.route('/api', buildApi());

  app.all('/api/*', (c) => c.json({ message: 'Not found.' }, 404));

  // ---- static assets and the application shell ----
  app.use('*', loadAccount);

  app.get('*', async (c) => {
    const url = new URL(c.req.url);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname !== '/' && !pathname.endsWith('/')) {
      const filePath = path.join(staticRoot, pathname);
      if (filePath.startsWith(staticRoot)) {
        try {
          const s = await stat(filePath);
          if (s.isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const immutable = /-[A-Z0-9]{8}\.(js|css|woff2?)$/i.test(filePath);
            const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
            return new Response(stream, {
              headers: {
                'Content-Type': MIME[ext] ?? 'application/octet-stream',
                'Content-Length': String(s.size),
                'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
              },
            });
          }
        } catch {
          /* fall through to the shell */
        }
      }
    }

    // Routes whose first paint must already carry an event's palette.
    const segments = pathname.split('/').filter(Boolean);
    try {
      if (segments.length === 1) {
        const e = await query(
          `SELECT e.*, cal.slug AS calendar_slug, cal.name AS calendar_name, cal.is_public,
                  (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in'))::int AS confirmed_count
             FROM events e JOIN calendars cal ON cal.id = e.calendar_id WHERE e.slug = $1`,
          [segments[0]!.toLowerCase()],
        );
        const row = e.rows[0];
        if (row && row.state !== 'draft') {
          return c.html(
            await themedIndex(row.theme_hex, {
              kind: 'event',
              slug: row.slug,
              theme_hex: row.theme_hex,
              title: row.title,
            }),
          );
        }
      }
      if (segments.length === 2 && segments[0] === 't') {
        const t = await query(
          `SELECT e.theme_hex, e.title FROM registrations r JOIN events e ON e.id = r.event_id
            WHERE r.ticket_code = $1`,
          [segments[1]!.toUpperCase()],
        );
        if (t.rowCount) {
          return c.html(
            await themedIndex(t.rows[0]!.theme_hex, { kind: 'ticket', title: t.rows[0]!.title }),
          );
        }
      }
      if (segments.length === 4 && segments[0] === 'event' && segments[2] === 'manage') {
        const e = await query('SELECT theme_hex FROM events WHERE slug = $1', [segments[1]!.toLowerCase()]);
        if (e.rowCount) {
          return c.html(await themedIndex(e.rows[0]!.theme_hex, { kind: 'manage' }));
        }
      }
    } catch (err) {
      log.warn('shell theming skipped', { err: String(err) });
    }

    const html = await readIndexHtml();
    return c.html(html);
  });

  serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) => {
    log.info('listening', { port: info.port, host: env.host, public_url: env.publicUrl, static_root: staticRoot });
  });
}

main().catch((err) => {
  log.error('startup failed', { err: String(err), stack: (err as Error).stack });
  process.exit(1);
});
