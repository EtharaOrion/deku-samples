import pg from 'pg';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
    });
    pool.on('error', (err) => {
      logLine({ level: 'error', msg: 'pg_pool_error', error: String(err && err.message) });
    });
  }
  return pool;
}

export async function q(text, params) {
  const res = await getPool().query(text, params);
  return res.rows;
}

export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  } finally {
    client.release();
  }
}

export function logLine(obj) {
  try {
    process.stdout.write(JSON.stringify(obj) + '\n');
  } catch { /* never throw from logging */ }
}
