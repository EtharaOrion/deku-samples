import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { waitForDb, applySchema } from './lib/db.js';
import { seedIfEmpty } from './lib/seed.js';
import { sessionFromRequest } from './lib/auth.js';
import { Refusal } from './lib/http.js';
import mountApi from './routes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

const app = new Hono();
let ready = false;

app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  await next();
});

app.get('/api/health', (c) => (ready ? c.json({ status: 'ok', ready: true }) : c.json({ status: 'starting', ready: false }, 503)));

// The app never accepts an identity a caller asserts: the session comes from
// the app's own token and nothing else.
app.use('/api/*', async (c, next) => {
  const session = await sessionFromRequest(c);
  c.set('session', session);
  await next();
});

const api = new Hono();
mountApi(api);
app.route('/api', api);

app.onError((err, c) => {
  if (err instanceof Refusal) {
    return c.json({ error: err.rule, rule: err.rule, ...err.extra }, err.status);
  }
  console.error('[ravel]', err);
  return c.json({ error: 'internal_error', message: 'The act was not completed and nothing changed.' }, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'not_found', message: 'There is no such route.' }, 404);
  }
  return c.text('not found', 404);
});

/* --------------------------------------------------------- static client */
if (existsSync(distDir)) {
  app.use('/assets/*', serveStatic({ root: 'dist', rewriteRequestPath: (p) => p.replace(/^\//, '/') }));
  app.use('/fonts/*', serveStatic({ root: 'dist' }));
  app.get('/favicon.svg', serveStatic({ root: 'dist', path: 'favicon.svg' }));
  const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf8');
  app.get('*', (c) => c.html(indexHtml));
}

async function start() {
  await waitForDb();
  await applySchema();
  await seedIfEmpty();
  ready = true;
  console.log('[ravel] ready');
}

const port = 4173;
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[ravel] listening on 0.0.0.0:${info.port}`);
});

start().catch((e) => {
  console.error('[ravel] startup failed', e);
  process.exit(1);
});
