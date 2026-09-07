import pg from 'pg';

const { Pool, types } = pg;

// int8 -> Number (all our counters are small); date -> plain YYYY-MM-DD string.
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
types.setTypeParser(1082, (v) => v);

// The pool is built on first use, never at import time: the image is built with
// no service reachable, and every address is read from the environment at start.
let poolInstance = null;

function getPool() {
  if (poolInstance) return poolInstance;
  const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  poolInstance = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  poolInstance.on('error', (err) => {
    process.stdout.write(
      `${JSON.stringify({ level: 'error', msg: 'idle pg client error', error: String(err && err.message) })}\n`,
    );
  });
  return poolInstance;
}

export const pool = {
  query: (text, params) => getPool().query(text, params),
  connect: () => getPool().connect(),
  end: () => (poolInstance ? poolInstance.end() : Promise.resolve()),
};

export function query(text, params) {
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

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already gone */
    }
    throw err;
  } finally {
    client.release();
  }
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_CHECK_VIOLATION = '23514';
