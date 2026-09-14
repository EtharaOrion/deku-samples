import { serve } from '@hono/node-server';
import app, { DIST } from './app.js';
import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';
import { q, one, exec } from './db.js';

const PORT = Number(process.env.PORT || 4173);

async function start() {
  // apply schema + seed once, guarded, so the image is self-sufficient from an empty database
  try {
    const row = await one(`SELECT v FROM meta WHERE k='schema_version'`).catch(() => null);
    if (!row) await bootstrap();
  } catch (e) {
    console.error('bootstrap deferred:', e.message);
  }

  // static client, served from the same origin as the API
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api')) return next();
    let p = c.req.path === '/' ? '/index.html' : c.req.path;
    const file = path.join(DIST, p);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const type = file.endsWith('.html') ? 'text/html; charset=utf-8'
        : file.endsWith('.js') ? 'text/javascript'
        : file.endsWith('.css') ? 'text/css; charset=utf-8'
        : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
      return c.body(fs.readFileSync(file), 200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    }
    const index = path.join(DIST, 'index.html');
    if (fs.existsSync(index)) return c.body(fs.readFileSync(index), 200, { 'Content-Type': 'text/html; charset=utf-8' });
    return c.text('client build not present', 404);
  });

  const server = serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
    console.log(`ravel serving on http://0.0.0.0:${info.port}`);
  });
}

async function bootstrap() {
  const schema = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../schema/001_tables.sql'), 'utf8');
  await exec(schema);
  const seed = (await import('./seed.js')).default;
  await seed();
}

start().catch((e) => { console.error('fatal', e); process.exit(1); });
