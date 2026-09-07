import pg from 'pg';

// Money is integer minor units everywhere. Never let pg hand back a float for
// numeric columns, and keep bigint counters as JS numbers (all well under 2^53).
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => v);
// DATE columns come back as plain YYYY-MM-DD strings, never Date objects, so a
// server timezone can never shift a release date or a support-until date.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.log(JSON.stringify({ level: 'error', msg: 'pg pool error', error: String(err && err.message) }));
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function withClient(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction(fn) {
  return withClient(async (client) => {
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
      throw err;
    }
  });
}

export async function waitForDatabase({ attempts = 60, delayMs = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
