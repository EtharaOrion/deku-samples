// Drops every table so the seed can be applied from scratch, as a fresh
// container would.
import { pool } from '../server/db.js';
const { rows } = await pool.query(
  "select tablename from pg_tables where schemaname = 'public'",
);
for (const r of rows) await pool.query(`drop table if exists "${r.tablename}" cascade`);
console.log(`dropped ${rows.length} tables`);
process.exit(0);
