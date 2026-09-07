import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './api.js';
import { query } from './db.js';
import { env, log } from './env.js';
import { migrateAndSeed } from './seed.js';
import { deriveTheme, themeStyleBlock } from './theme.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const STATIC_ROOT = path.resolve(here, '..', env.staticDir);
const INDEX_PATH = path.join(STATIC_ROOT, 'index.html');

const app = new Hono();

/* structured request log */
app.use('*', async (c, next) => {
  const started = Date.now();
  await next();
  log('info', 'http', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    ms: Date.now() - started,
  });
});

app.route('/api', api);

/* ---------------- static assets ---------------- */

const relativeStatic = path.relative(process.cwd(), STATIC_ROOT) || '.';

app.use(
  '/*',
  serveStatic({
    root: relativeStatic,
    rewriteRequestPath: (p) => p,
  })
);

/* ---------------- application shell ---------------- */

let shellCache: string | null = null;
function shell(): string {
  if (shellCache === null) shellCache = fs.readFileSync(INDEX_PATH, 'utf8');
  return shellCache;
}

function withTheme(html: string, themeHex: string | null, title?: string): string {
  let out = html;
  if (title) {
    const safe = title.replace(/[<&]/g, (m) => (m === '<' ? '&lt;' : '&amp;'));
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${safe}</title>`);
  }
  if (!themeHex) return out;
  const block = themeStyleBlock(deriveTheme(themeHex));
  return out.replace(
    '</head>',
    `<style id="event-theme">${block}</style><meta name="theme-color" content="${themeHex}"></head>`
  );
}

/**
 * The event's key colour is written into the first document the browser paints,
 * so the page arrives already wearing it and never repaints from grey.
 */
async function themeForPath(pathname: string): Promise<{ hex: string | null; title?: string }> {
  const parts = pathname.split('/').filter(Boolean);
  try {
    if (parts.length === 1) {
      const r = await query<{ theme_hex: string; title: string }>(
        'SELECT theme_hex, title FROM events WHERE slug = $1',
        [parts[0].toLowerCase()]
      );
      if (r.rowCount) return { hex: r.rows[0].theme_hex, title: r.rows[0].title };
    }
    if (parts.length === 2 && parts[0] === 't') {
      const r = await query<{ theme_hex: string; title: string }>(
        `SELECT e.theme_hex, e.title FROM registrations r JOIN events e ON e.id = r.event_id
          WHERE r.ticket_code = $1`,
        [parts[1].toUpperCase()]
      );
      if (r.rowCount) return { hex: r.rows[0].theme_hex, title: `Ticket for ${r.rows[0].title}` };
    }
    if (parts.length >= 2 && parts[0] === 'event') {
      const r = await query<{ theme_hex: string; title: string }>(
        'SELECT theme_hex, title FROM events WHERE slug = $1',
        [parts[1].toLowerCase()]
      );
      if (r.rowCount) return { hex: r.rows[0].theme_hex, title: r.rows[0].title };
    }
  } catch (e) {
    log('warn', 'shell.theme_lookup_failed', { err: (e as Error).message });
  }
  return { hex: null };
}

app.get('*', async (c) => {
  const pathname = new URL(c.req.url).pathname;
  if (pathname.startsWith('/api')) return c.json({ message: 'Nothing lives at that address.' }, 404);
  const { hex, title } = await themeForPath(pathname);
  return c.html(withTheme(shell(), hex, title));
});

/* ---------------- boot ---------------- */

async function main() {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await migrateAndSeed();
      break;
    } catch (e) {
      log('warn', 'db.not_ready', { attempt, err: (e as Error).message });
      if (attempt === 30) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) => {
    log('info', 'server.listening', {
      port: info.port,
      host: env.host,
      public_url: env.publicUrl || null,
    });
  });
}

process.on('unhandledRejection', (reason) => {
  log('error', 'unhandled_rejection', { err: String(reason) });
});

main().catch((e) => {
  log('error', 'server.boot_failed', { err: (e as Error).message });
  process.exit(1);
});
