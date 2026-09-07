import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import api from './api.js';
import { waitForDatabase, migrate } from './db.js';
import { seed } from './seed.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dist = join(root, 'dist');

const PORT = 4173;
const app = new Hono();

let ready = false;

app.route('/api', api);

// The client is a single-page application: every unknown path is the shell.
app.use('/assets/*', serveStatic({ root: './dist' }));
app.use('/fonts/*', serveStatic({ root: './dist' }));
app.get('/favicon.svg', serveStatic({ path: './dist/favicon.svg' }));
app.get('/robots.txt', (c) =>
  c.body('User-agent: *\nDisallow: /verify/\nDisallow: /console/\nAllow: /\n', 200,
    { 'content-type': 'text/plain; charset=utf-8' }));

let shell = null;
app.get('*', async (c) => {
  if (shell === null) {
    const indexPath = join(dist, 'index.html');
    shell = existsSync(indexPath)
      ? await readFile(indexPath, 'utf8')
      : '<!doctype html><html><body><p>The client build is missing.</p></body></html>';
  }
  return c.html(shell);
});

async function start() {
  await waitForDatabase();
  await migrate();
  const result = await seed();
  console.log(result.seeded ? 'seed: written' : 'seed: already present');
  ready = true;
  serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
    console.log(`Ravel listening on 0.0.0.0:${info.port}`);
  });
}

start().catch((err) => {
  console.error('failed to start', err);
  process.exit(1);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
