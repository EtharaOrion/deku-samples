import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { Refusal } from './lib/http.js';
import { migrate, seed } from '../db/seed.js';
import api from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const app = new Hono();

let ready = false;

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

app.get('/api/health', (c) => (ready
  ? c.json({ status: 'ok', ready: true })
  : c.json({ status: 'starting', ready: false }, 503)));

app.route('/api', api);

app.onError((err, c) => {
  if (err instanceof Refusal) {
    return c.json({ ...err.body, error: err.body.error || err.code }, err.status);
  }
  console.error('[error]', c.req.method, c.req.path, err);
  return c.json({ error: 'internal_error', message: 'The request could not be completed.' }, 500);
});

// an unknown API route answers as the API, never as the single-page application
app.all('/api/*', (c) => c.json({ error: 'not_found', message: 'No such route.' }, 404));

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'not_found', message: 'No such route.' }, 404);
  }
  return c.html(indexHtml());
});

// The built client, served from one origin with the API. serveStatic resolves its
// root against the working directory, so the app runs from its own root whatever
// directory it was started in.
process.chdir(root);
app.use('/assets/*', serveStatic({ root: './dist' }));
app.use('/fonts/*', serveStatic({ root: './dist' }));
app.get('/favicon.svg', serveStatic({ path: './dist/favicon.svg' }));

let cachedHtml = null;
function indexHtml() {
  if (!cachedHtml) cachedHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  return cachedHtml;
}

// the single-page application answers every non-API route
app.get('*', (c) => c.html(indexHtml()));

// 4173 is the container-internal port the deployment contract names. RAVEL_PORT
// exists only so a second copy can be started beside it during a local check.
const port = Number(process.env.RAVEL_PORT || 4173);

async function start() {
  await migrate();
  const result = await seed();
  console.log(`[ravel] schema applied; seed ${result.seeded ? 'written' : 'already present'}`);
  ready = true;
}

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[ravel] listening on 0.0.0.0:${info.port}`);
});

start().catch((e) => {
  console.error('[ravel] startup failed', e);
  process.exit(1);
});
