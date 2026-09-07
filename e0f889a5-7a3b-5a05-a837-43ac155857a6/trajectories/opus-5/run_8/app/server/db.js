import pg from 'pg';

// Money is an integer count of minor units everywhere. Never let pg hand back a float
// for an int8 or a numeric that we would then do arithmetic on.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
pg.types.setTypeParser(1700, (v) => v); // numeric stays a string
// A calendar date is a date, not an instant: keep it as the YYYY-MM-DD the
// column holds rather than letting it acquire a timezone on the way out.
pg.types.setTypeParser(1082, (v) => v);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || 12),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  process.stdout.write(JSON.stringify({ level: 'error', msg: 'pg pool error', error: String(err) }) + '\n');
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function one(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] ?? null;
}

export async function many(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

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
