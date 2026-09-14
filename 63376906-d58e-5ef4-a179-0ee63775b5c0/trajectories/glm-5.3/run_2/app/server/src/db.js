import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
});

export async function q(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function one(text, params = []) {
  const rows = await q(text, params);
  return rows[0] || null;
}

// Every transaction takes an advisory lock so two allocations racing for the
// same remainder inside a period produce one success and one refusal, and so
// two signatures landing at the same moment take two consecutive numbers.
export async function withTx(lockKey, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (lockKey !== null && lockKey !== undefined) {
      await client.query("SELECT pg_advisory_xact_lock($1)", [hashKey(lockKey)]);
    }
    const out = await fn({
      query: (t, p = []) => client.query(t, p).then((r) => r.rows),
      one: async (t, p = []) => (await client.query(t, p)).rows[0] || null,
      client,
    });
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

function hashKey(key) {
  let h = 0n;
  for (const ch of String(key)) h = (h * 131n + BigInt(ch.charCodeAt(0))) & 0x7fffffffffffn;
  return Number(h);
}

export async function migrate() {
  await pool.query(
    `create table if not exists schema_migrations(version text primary key, applied_at timestamptz default now())`
  );
}
