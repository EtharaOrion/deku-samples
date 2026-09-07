import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForDb, withNamedLock } from './lib/db.js';
import { migrate, seed } from './seed.js';
import { Refusal } from './lib/http.js';
import api from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '../../client/dist');

const app = new Hono();
let ready = false;

app.onError((err, c) => {
  if (err instanceof Refusal || err.status) {
    return c.json(err.body || { error: 'refused', detail: err.message }, err.status || 400);
  }
  console.error('[error]', err);
  return c.json({ error: 'internal_error', detail: 'The request could not be completed.' }, 500);
});

app.get('/api/health', (c) => (ready ? c.json({ status: 'ok', ready: true }) : c.json({ status: 'starting', ready: false }, 503)));

app.route('/api', api);

app.all('/api/*', (c) => c.json({ error: 'not_found', detail: 'No such route.' }, 404));

// Serve the production client build from the same origin.
app.use('/assets/*', serveStatic({ root: path.relative(process.cwd(), CLIENT_DIR) }));
app.use('/fonts/*', serveStatic({ root: path.relative(process.cwd(), CLIENT_DIR) }));
app.get('/favicon.svg', serveStatic({ path: path.relative(process.cwd(), path.join(CLIENT_DIR, 'favicon.svg')) }));
app.get('/robots.txt', (c) =>
  c.text('User-agent: *\nDisallow: /verify/\nDisallow: /console/\nAllow: /\n', 200, { 'content-type': 'text/plain; charset=utf-8' }),
);

let indexHtml = null;
app.get('*', (c) => {
  if (indexHtml === null) {
    try {
      indexHtml = fs.readFileSync(path.join(CLIENT_DIR, 'index.html'), 'utf8');
    } catch {
      indexHtml = '<!doctype html><html><body><p>The client build is missing.</p></body></html>';
    }
  }
  return c.html(indexHtml);
});

const port = 4173;

async function start() {
  serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
    console.log(`[ravel] listening on 0.0.0.0:${info.port}`);
  });
  try {
    await waitForDb();
    // Migrating and seeding run under one lock, so two instances started
    // against one database apply the schema once and seed once rather than
    // racing each other into a half-built state.
    await withNamedLock('ravel:startup', async () => {
      await migrate();
      await seed();
    });
    ready = true;
    console.log('[ravel] ready');
  } catch (e) {
    // The listener stays up and /api/health keeps answering 503, so the failure
    // is visible to whatever is watching rather than becoming a crash loop.
    console.error('[ravel] startup failed', e);
    process.exitCode = 1;
  }
}

start();
