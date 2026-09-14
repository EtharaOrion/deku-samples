import pg from 'pg';
import { ensureSeed, ensureSchema } from './init.js';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
if (process.argv.includes('--fresh')) await ensureSchema(pool, true);
await ensureSeed(pool);
await pool.end();
console.log('db ready');
