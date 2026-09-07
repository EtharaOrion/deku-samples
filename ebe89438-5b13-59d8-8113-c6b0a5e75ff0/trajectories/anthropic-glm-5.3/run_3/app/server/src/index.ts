import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { pool } from './db.ts';
import { config } from './config.ts';
import { logger } from './log.ts';
import { migrate, seed } from './seed.ts';
import { api } from './routes.ts';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, 'web');
const staticApp = new Hono();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

staticApp.all('*', async (c) => {
  const rel = decodeURIComponent(new URL(c.req.url).pathname);
  const safe = normalize(rel).replace(/^([.][.][/\\])+/, '');
  let file = join(webRoot, safe === '/' ? 'index.html' : safe);
  if (!file.startsWith(webRoot)) return c.notFound();
  if (!existsSync(file) || statSync(file).isDirectory() || extname(file) === '') {
    file = join(webRoot, 'index.html');
  }
  if (!existsSync(file)) return c.text('Application shell not built.', 500);
  return c.body(readFileSync(file), 200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': extname(file) === '.html' ? 'no-store' : 'public, max-age=3600',
  });
});

const app = new Hono();
app.route('/api', api);
app.route('/', staticApp);

async function main() {
  const migrateOnly = process.argv.includes('--migrate-only');
  const client = await pool.connect();
  try {
    logger.info('applying schema and seed');
    await migrate(client);
    await seed(client);
  } finally {
    client.release();
  }
  if (migrateOnly) {
    logger.info('migrate-only requested; exiting');
    await pool.end();
    return;
  }

  const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () => {
    logger.info('listening', { port: config.port, host: config.host, publicUrl: config.publicUrl });
  });

  const shutdown = async (sig: string) => {
    logger.info('shutting down', { signal: sig });
    server.close(() => { void pool.end(); });
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  logger.error('fatal', { message: e?.message, stack: e?.stack });
  process.exit(1);
});
