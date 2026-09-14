import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    await pool.query('select 1');
    break;
  } catch (e) {
    if (attempt === 39) throw e;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
await pool.query(sql);
console.log('schema applied');
await pool.end();
