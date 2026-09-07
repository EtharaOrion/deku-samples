import pg from 'pg';

// Money is an integer count of minor units everywhere. Never let pg hand back a
// float for an integer column, and keep numerics as strings so no float appears.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
pg.types.setTypeParser(1700, (v) => v); // numeric -> string

let pool;
export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({
      connectionString,
      max: Number(process.env.PGPOOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (err) => {
      console.log(JSON.stringify({ level: 'error', msg: 'pg pool error', error: err.message }));
    });
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

export async function one(text, params) {
  const r = await getPool().query(text, params);
  return r.rows[0] ?? null;
}

export async function many(text, params) {
  const r = await getPool().query(text, params);
  return r.rows;
}

/** Run fn inside a transaction, rolling back on any throw. */
export async function tx(fn) {
  const client = await getPool().connect();
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

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_CHECK_VIOLATION = '23514';
