import { makePool, ensureSchema } from './db.mjs';
import { seed } from './seed.mjs';
import { env } from './env.mjs';
import * as kb from './killbill.mjs';

// The app state is held on globalThis because two module graphs can load this
// file (the server's own graph and Astro's bundled graph). One boot, one state.
const G = globalThis;

export async function boot() {
  if (G.__velaState) return G.__velaState;
  if (G.__velaBooting) return G.__velaBooting;
  G.__velaBooting = (async () => {
    const db = makePool(env.databaseUrl);
    await ensureSchema(db);
    await seed(db);
    const kbHealthy = await kb.health().catch(() => false);
    G.__velaState = { db, kbHealthy, bootedAt: new Date().toISOString() };
    return G.__velaState;
  })();
  const s = await G.__velaBooting;
  G.__velaBooting = null;
  return s;
}

export function get() {
  if (!G.__velaState) throw new Error('app not ready');
  return G.__velaState;
}

export function tryGet() {
  return G.__velaState || null;
}
