import pg from 'pg';

// Money is an integer count of minor units everywhere. Never let pg hand back a float
// for bigint/numeric columns: parse to string or integer explicitly.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
pg.types.setTypeParser(1700, (v) => v); // numeric -> string

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX || 12),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.log(JSON.stringify({ level: 'error', msg: 'pg pool error', error: err.message }));
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

/** Run fn inside a transaction, rolling back on throw. */
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

export function isUniqueViolation(err) {
  return err && err.code === '23505';
}

export function isCheckViolation(err) {
  return err && err.code === '23514';
}
