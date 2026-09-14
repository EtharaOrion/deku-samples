import * as http from 'node:http';
import { migrate, waitForDatabase } from './server/migrate.js';
import { seed } from './server/seed.js';
import { logEvent } from './server/log.js';

/**
 * Container entrypoint. The schema and seed are applied by the image itself at
 * start, before the server accepts requests.
 */
export async function createHandler(): Promise<void> {
  const started = Date.now();
  await waitForDatabase();
  await migrate();
  await seed();
  logEvent('app.ready', { ms: Date.now() - started });

  const { handler } = await import('./entry.mjs');
  const port = Number(process.env.PORT || process.env.APP_PUBLIC_PORT || 4173);
  const server = http.createServer(handler as any);
  server.listen(port, '0.0.0.0', () => {
    logEvent('app.listening', { port, host: '0.0.0.0' });
  });

  const shutdown = (signal: string) => {
    logEvent('app.stopping', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
