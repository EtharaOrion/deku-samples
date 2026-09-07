import pg from 'pg';

// Money is an integer count of minor units everywhere. Never let pg hand back a
// float for a bigint column; numerics stay strings so nothing rounds.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : v));
// A date is a calendar day, not an instant: keep it as YYYY-MM-DD so it never
// drifts a day across a timezone on the way to the browser.
pg.types.setTypeParser(1082, (v) => v);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.PGPOOL_MAX || 12),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  process.stderr.write(JSON.stringify({ level: 'error', msg: 'pg pool error', error: String(err) }) + '\n');
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function one(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}

export async function many(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

/** Run fn inside a transaction; rolls back on throw. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function waitForDatabase(attempts = 60) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
