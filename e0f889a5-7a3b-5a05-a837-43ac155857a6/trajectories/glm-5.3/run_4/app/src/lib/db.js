import pg from 'pg';

// Postgres returns NUMERIC as string; timestamps are fine as Date.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'pg pool error', error: String(err) }));
});

export async function query(text, params = []) {
  const started = Date.now();
  const result = await pool.query(text, params);
  if (process.env.LOG_SLOW_SQL_MS && Date.now() - started > Number(process.env.LOG_SLOW_SQL_MS)) {
    console.log(JSON.stringify({ level: 'warn', msg: 'slow sql', ms: Date.now() - started, sql: text.slice(0, 120) }));
  }
  return result;
}

export async function one(text, params = []) {
  const r = await query(text, params);
  return r.rows[0] || null;
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

/** Wrap a transaction around a single statement for row-level locking. */
export async function withClient(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export default { query, one, withTransaction, withClient, pool };
