// App bootstrap: connect, apply schema, seed once, expose readiness.
import { applySchema, seed } from './seed.js';
import { getPool, q, logLine } from './lib/db.js';
import { healthcheck as kbHealth } from './lib/killbill.js';

let ready = false;
let bootPromise = null;

export async function boot() {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await q('SELECT 1');
        break;
      } catch (err) {
        logLine({ level: 'warn', msg: 'db_wait', attempt, error: String(err && err.message) });
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    await applySchema();
    await seed();
    ready = true;
    logLine({ level: 'info', msg: 'boot_complete' });
    return true;
  })();
  return bootPromise;
}

export function isReady() {
  return ready;
}
