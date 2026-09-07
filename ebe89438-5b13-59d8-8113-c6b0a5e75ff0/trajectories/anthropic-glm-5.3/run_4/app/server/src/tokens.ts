import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { newToken } from './util.js';

const TOKEN_TTL_MS = 14 * 86400000;

export async function createToken(pool: Pool, accountId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await pool.query(`insert into auth_tokens (token, account_id, expires_at) values ($1, $2, $3)`, [token, accountId, expiresAt]);
  return { token, expiresAt };
}

export async function deleteToken(pool: Pool, token: string): Promise<void> {
  await pool.query(`delete from auth_tokens where token = $1`, [token]);
}

export function bearerFrom(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}
