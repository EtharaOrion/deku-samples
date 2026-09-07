import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import api from './api.js';
import { migrate, seed } from './seed.js';
import { logLine, newRequestId } from './log.js';
import * as killbill from './killbill.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

async function boot() {
  // Schema and seed are applied by the image itself, at container start.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await migrate();
      await seed();
      break;
    } catch (err) {
      if (attempt >= 30) throw err;
      logLine({ level: 'warn', msg: 'database not ready, retrying', attempt, error: String(err.message || err) });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  try {
    const ok = await killbill.health();
    logLine({ level: 'info', msg: 'killbill reachable', healthy: ok });
  } catch (err) {
    logLine({ level: 'warn', msg: 'killbill not reachable at boot', error: String(err.message || err) });
  }

  const app = new Hono();
  app.route('/', api);

  // Astro's SSR app: it takes a Request and answers a Response, which is what
  // Hono speaks, so both halves sit on one origin behind one listener.
  const { App } = await import('astro/app');
  const serverDir = path.join(root, 'dist', 'server');
  const manifestFile = (await readdir(serverDir)).find((f) => /^manifest.*\.mjs$/.test(f));
  if (!manifestFile) throw new Error('no Astro manifest in dist/server; run the build');
  // entry.mjs wires the manifest to the page map, so it must be imported first.
  await import(pathToFileURL(path.join(serverDir, 'entry.mjs')).href);
  const { manifest } = await import(pathToFileURL(path.join(serverDir, manifestFile)).href);
  const astro = new App(manifest);

  const clientRoot = path.join(root, 'dist', 'client');
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), clientRoot) || './dist/client' }));

  app.all('*', async (c) => {
    const requestId = c.req.header('x-request-id') || newRequestId();
    const started = Date.now();
    const rendered = await astro.render(c.req.raw, { locals: { requestId } });

    // Cookies set through Astro.cookies are handed to the adapter separately,
    // and are the only ones that survive an Astro.redirect. Apply them here or
    // signing in silently loses its session.
    const res = new Response(rendered.body, rendered);
    for (const cookie of App.getSetCookieFromResponse(rendered)) {
      res.headers.append('set-cookie', cookie);
    }

    logLine({
      level: 'info',
      request_id: requestId,
      method: c.req.method,
      route: new URL(c.req.url).pathname,
      status: res.status,
      duration_ms: Date.now() - started,
    });
    return res;
  });

  serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
    logLine({ level: 'info', msg: 'listening', host: HOST, port: info.port, public_url: process.env.APP_PUBLIC_URL });
  });
}

boot().catch((err) => {
  logLine({ level: 'fatal', msg: 'boot failed', error: String(err && err.stack ? err.stack : err) });
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logLine({ level: 'error', msg: 'unhandled rejection', error: String(err && err.stack ? err.stack : err) });
});
