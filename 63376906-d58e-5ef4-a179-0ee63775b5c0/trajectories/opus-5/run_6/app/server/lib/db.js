import pg from 'pg';

const { Pool } = pg;

// integers come back as numbers, not strings: every figure in this product is an integer
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const pool = new Pool({ connectionString, max: 12 });

export async function q(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

export async function one(text, params) {
  const rows = await q(text, params);
  return rows[0] || null;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw e;
  } finally {
    client.release();
  }
}
