import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
pool.on('error', (e) => console.error('pg pool error', e.message));

export async function q(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}
export async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn((sql, p = []) => client.query(sql, p).then((r) => r.rows));
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
export default pool;
