import { createServer } from 'node:http';
import { boot } from './server/state.mjs';
import { buildApi } from './server/api.mjs';
import { makeHandler } from './server/middleware.mjs';
import { env } from './server/env.mjs';

const api = buildApi();
const handler = await makeHandler({ api });

// Listen first, then finish booting. A backing service that is still coming up
// must leave the process alive and /api/health reporting not-ready, never crash
// the container before it could be reached.
const server = createServer(handler);
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.listen(env.port, env.host, () => {
  process.stdout.write(JSON.stringify({
    ts: new Date().toISOString(), level: 'info', msg: 'listening',
    host: env.host, port: env.port, public_url: env.publicUrl,
  }) + '\n');
});

boot().then(() => {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'ready' }) + '\n');
}).catch((e) => {
  // The database may simply be behind us: log, keep serving, and retry.
  process.stdout.write(JSON.stringify({
    ts: new Date().toISOString(), level: 'error', msg: 'boot_failed', message: e.message,
  }) + '\n');
  const retry = setInterval(async () => {
    try {
      await boot();
      clearInterval(retry);
      process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'ready_after_retry' }) + '\n');
    } catch (err) {
      process.stdout.write(JSON.stringify({
        ts: new Date().toISOString(), level: 'error', msg: 'boot_retry_failed', message: err.message,
      }) + '\n');
    }
  }, 2000);
  retry.unref();
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
