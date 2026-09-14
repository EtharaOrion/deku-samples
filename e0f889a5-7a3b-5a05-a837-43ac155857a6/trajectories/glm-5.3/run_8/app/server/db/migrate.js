import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { pool } from './index.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}
