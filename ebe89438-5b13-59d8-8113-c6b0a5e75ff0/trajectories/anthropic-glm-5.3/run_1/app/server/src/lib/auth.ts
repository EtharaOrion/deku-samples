import { Context } from 'hono';
import { db } from '../db/client.js';
import { verifyPassword, bearerToken, sha256 } from './util.js';

export interface Account {
  id: string; email: string; display_name: string; handle: string; role: 'host' | 'guest';
}

export async function authAccount(c: Context): Promise<Account | null> {
  const header = c.req.header('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1];
  const { rows } = await db.query(
    `SELECT a.id, a.email, a.display_name, a.handle, a.role, t.expires_at
       FROM auth_tokens t JOIN accounts a ON a.id = t.account_id
      WHERE t.token_hash = $1 LIMIT 1`,
    [Buffer.from(sha256(token), 'utf8')]
  );
  const row = rows[0] as (Account & { expires_at: Date }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.query(`DELETE FROM auth_tokens WHERE token_hash = $1`, [Buffer.from(sha256(token), 'utf8')]);
    return null;
  }
  return { id: row.id, email: row.email, display_name: row.display_name, handle: row.handle, role: row.role };
}

export interface NewToken { token: string; expires_at: Date }

export async function issueToken(accountId: string): Promise<NewToken> {
  const token = bearerToken();
  const expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  await db.query(
    `INSERT INTO auth_tokens (token_hash, account_id, expires_at) VALUES ($1, $2, $3)`,
    [Buffer.from(sha256(token), 'utf8'), accountId, expires_at]
  );
  return { token, expires_at };
}
