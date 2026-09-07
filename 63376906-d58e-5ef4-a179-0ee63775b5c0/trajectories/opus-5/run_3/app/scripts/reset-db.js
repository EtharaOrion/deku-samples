// A development convenience: drop every table this app owns so the schema and
// the seed can be applied from scratch, exactly as a fresh container would.
// It is not shipped in the image.
import pg from 'pg';

const c = new pg.Client(process.env.DATABASE_URL || process.env.DB_URL);
await c.connect();
const { rows } = await c.query(
  `SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`
);
if (rows.length) {
  await c.query(`DROP TABLE IF EXISTS ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`);
}
const fns = await c.query(
  `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = current_schema()`
);
for (const f of fns.rows) {
  await c.query(`DROP FUNCTION IF EXISTS "${f.proname}"() CASCADE`).catch(() => {});
}
console.log(`dropped ${rows.length} tables`);
await c.end();
