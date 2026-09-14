import pg from "pg";

const { Pool } = pg;
let pool = null;

export function db() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    pool.on("error", (e) => console.error("pg pool error", e.message));
  }
  return pool;
}

export async function q(sql, params = []) {
  const r = await db().query(sql, params);
  return r.rows;
}
export async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}
export async function tx(fn) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
