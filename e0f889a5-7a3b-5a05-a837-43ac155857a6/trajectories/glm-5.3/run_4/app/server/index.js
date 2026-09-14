import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createServer } = require('http');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLIENT_DIR = join(ROOT, 'dist', 'client');

const MIME = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.dmg': 'application/octet-stream',
  '.fw': 'application/octet-stream',
};

/** Serve a static file from dist/client, guarding against traversal. */
function staticResponse(pathname) {
  const clean = decodeURIComponent(pathname).replace(/\0/g, '');
  if (clean.includes('..')) return null;
  const full = join(CLIENT_DIR, clean);
  if (!full.startsWith(CLIENT_DIR)) return null;
  if (!existsSync(full) || !statSync(full).isFile()) return null;
  const buf = readFileSync(full);
  return new Response(buf, {
    headers: {
      'Content-Type': MIME[extname(full).toLowerCase()] || 'application/octet-stream',
      'Content-Length': String(buf.length),
      'Cache-Control': clean.startsWith('/_astro/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    },
  });
}

/**
 * Serves the built Astro app and the Hono /api on one origin.
 * Binds 0.0.0.0 on APP_PUBLIC_PORT (container-internal 4173).
 */
const port = Number(process.env.APP_PUBLIC_PORT || process.env.PORT || 4173);
const host = '0.0.0.0';

async function main() {
  const { handler: astroMiddleware } = await import('../dist/server/entry.mjs');
  const api = (await import('../src/lib/api.js')).default;
  const { fetch: apiFetch } = api;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(', '));
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;

      let response;
      try {
        response = await apiFetch(new Request(url, {
          method: req.method,
          headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
          duplex: 'half',
        }));
      } catch (err) {
        console.log(JSON.stringify({ level: 'error', msg: 'api_error', error: String(err) }));
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong at our end.', request_id: null } }));
        return;
      }

      const buf = Buffer.from(await response.arrayBuffer());
      const outHeaders = {};
      response.headers.forEach((v, k) => { outHeaders[k] = v; });
      res.writeHead(response.status, outHeaders);
      res.end(buf);
      return;
    }

    // Static assets built into dist/client.
    if (!url.pathname.startsWith('/api/')) {
      const stat = staticResponse(url.pathname);
      if (stat) {
        const buf = Buffer.from(await stat.arrayBuffer());
        const out = {};
        stat.headers.forEach((v, k) => { out[k] = v; });
        res.writeHead(200, out);
        res.end(buf);
        return;
      }
    }

    // Everything else is the Astro app. In middleware mode the handler takes
    // (req, res) and writes the response itself, so we pass them straight through.
    const start = Date.now();
    try {
      await astroMiddleware(req, res, () => {
        if (!res.headersSent) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!doctype html><html><body><h1>That page does not exist.</h1></body></html>');
        }
      });
    } catch (err) {
      console.log(JSON.stringify({ level: 'error', msg: 'page_error', error: String(err), ms: Date.now() - start }));
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><html><body><h1>Something went wrong at our end.</h1></body></html>');
      }
    }
  });

  server.listen(port, host, () => {
    console.log(JSON.stringify({ level: 'info', msg: 'listening', host, port }));
  });
}


main().catch((err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'startup_failed', error: String(err) }));
  process.exit(1);
});
