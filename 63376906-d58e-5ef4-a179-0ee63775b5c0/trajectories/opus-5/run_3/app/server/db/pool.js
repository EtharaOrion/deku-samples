import pg from 'pg';

const { Pool, types } = pg;

// int8 comes back as a string by default; every mass in this product is an
// integer number of grams and fits comfortably in a JS safe integer.
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

// A `date` is a calendar day and nothing else. Parsed into a JS Date it
// acquires a timezone it never had and reads back as "Tue Jun 30", so it is
// kept as the ISO day postgres sent. Every timestamp keeps its zone.
types.setTypeParser(1082, (v) => v);

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

// The operational record: written by people at a plant.
export const pool = new Pool({ connectionString, max: 12 });

// The arithmetic layer reads through a connection that postgres itself refuses
// to let write. The dependency direction is enforced by the database rather
// than by a comment: no call into the engine can write an operational record.
export const readPool = new Pool({ connectionString, max: 8 });
readPool.on('connect', (client) => {
  client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY').catch(() => {});
});

export async function q(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}
export async function q1(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}
export async function rq(text, params) {
  const r = await readPool.query(text, params);
  return r.rows;
}
export async function rq1(text, params) {
  const r = await readPool.query(text, params);
  return r.rows[0] || null;
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

export async function waitForDb(attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
