import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './lib/auth.js';
import { sessionFromDb, tokenIntrospect } from './lib/auth.js';
import { ensureSeed } from './db/init.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });

export const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.code, message: err.message, ...(err.extra || {}) }, err.status);
  }
  console.error('unhandled', err);
  return c.json({ error: 'internal_error', message: 'The request could not be completed.' }, 500);
});

// ---- session middleware -------------------------------------------------
app.use('/api/*', async (c, next) => {
  const auth = c.req.header('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    try {
      const t = await tokenIntrospect(token);
      if (t && t.active && t.email) {
        const s = await sessionFromDb(pool, t.email);
        if (s.roles.length || s.sites.length) c.set('session', s);
      }
    } catch (e) {
      // keycloak unreachable: no session
    }
  }
  await next();
});

// ---- routes --------------------------------------------------------------
const routeFiles = ['auth','sites','parties','collectors','batches','runs','lots','deviations',
  'overrides','tests','balance','conversion','carbon','energy','specifications','customers','change',
  'contracts','certificates','restatements','record','inbound','public','enquiries','reconciliation',
  'exports','blending','sites_cert'];
for (const f of routeFiles) {
  const mod = await import(`./routes/${f}.js`);
  await mod.register({ app, pool });
}

app.get('/api/health', (c) => c.json({ status: 'ok' }));

// ---- static client -------------------------------------------------------
const dist = path.join(__dirname, '..', 'dist');
const readIndex = () => {
  try { return fs.readFileSync(path.join(dist, 'index.html'), 'utf8'); }
  catch { return '<!doctype html><title>Ravel</title><p>Client build missing.'; }
};

const staticRoot = path.isAbsolute(dist) ? path.relative(process.cwd(), dist) : dist;
app.use('*', serveStatic({ root: staticRoot || dist }));
app.get('*', (c) => {
  const p = c.req.path;
  if (p.startsWith('/api/')) return c.json({ error: 'not_found' }, 404);
  return c.html(readIndex());
});

const port = Number(process.env.PORT || 4173);

async function boot() {
  // apply schema and seed on first start; idempotent thereafter
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await ensureSeed(pool);
      break;
    } catch (e) {
      if (attempt === 29) { console.error('seed failed', e); process.exit(1); }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
    console.log(`ravel listening on ${info.port}`);
  });
}
boot();
