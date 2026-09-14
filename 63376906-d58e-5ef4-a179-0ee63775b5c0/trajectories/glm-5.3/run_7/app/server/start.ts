// Runs schema and seed once, then starts the server.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const attempt = async (fn: () => Promise<void>, tries = 30, waitMs = 2000) => {
  for (let i = 0; i < tries; i++) {
    try { await fn(); return; } catch (e: any) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, waitMs)); }
  }
};

await attempt(async () => {
  execFileSync(process.execPath, [join(here, 'seed.mjs')], { stdio: 'inherit' });
});

const { serve } = await import('@hono/node-server');
const { app } = await import('./app.js');
const port = Number(process.env.PORT || 4173);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log('ravel serving on 0.0.0.0:' + info.port);
});
