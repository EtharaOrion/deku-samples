import { q } from './db/pool.ts';
import { verifyPassword } from './crypto.ts';
import { randomToken, sha256Hex } from './crypto.ts';

export type Customer = { id: string; email: string; name: string; status: string; created_at: string };

const TOKEN_TTL_DAYS = 14;

export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

export async function customerByEmail(email: string): Promise<(Customer & { password_hash: string }) | null> {
  const res = await q(`SELECT id, email, name, status, created_at, password_hash FROM customer WHERE lower(email) = lower($1)`, [normalizeEmail(email)]);
  return res.rows[0] ?? null;
}

export async function customerById(id: string | number): Promise<Customer | null> {
  const res = await q(`SELECT id, email, name, status, created_at FROM customer WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function createCustomer(input: { email: string; password: string; name: string; passwordHash: string }): Promise<Customer> {
  const res = await q(
    `INSERT INTO customer (email, name, password_hash, status) VALUES ($1, $2, $3, 'active') RETURNING id, email, name, status, created_at`,
    [normalizeEmail(input.email), input.name, input.passwordHash]
  );
  return res.rows[0];
}

export async function issueToken(customerId: string | number): Promise<{ token: string; expires_at: string }> {
  const token = randomToken(32);
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await q(`INSERT INTO auth_token (token_hash, customer_id, expires_at) VALUES ($1, $2, $3)`, [sha256Hex(token), customerId, expires.toISOString()]);
  return { token, expires_at: expires.toISOString() };
}

export async function customerForToken(token: string | null | undefined): Promise<Customer | null> {
  if (!token) return null;
  const res = await q(
    `SELECT c.id, c.email, c.name, c.status, c.created_at
       FROM auth_token t JOIN customer c ON c.id = t.customer_id
      WHERE t.token_hash = $1 AND t.expires_at > now()`,
    [sha256Hex(token)]
  );
  return res.rows[0] ?? null;
}

export async function authenticate(email: string, password: string): Promise<Customer | null> {
  const customer = await customerByEmail(email);
  if (!customer) return null;
  if (customer.status !== 'active') return null;
  const ok = await verifyPassword(password, customer.password_hash);
  return ok ? customer : null;
}

export function bearerFrom(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function rememberLastSeenRelease(customerId: string | number, build: number): Promise<void> {
  await q(`UPDATE customer SET status = status WHERE id = $1`, [customerId]);
  await q(`INSERT INTO app_meta (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [`last_seen_build:${customerId}`, String(build)]);
}

export async function lastSeenReleaseBuild(customerId: string | number): Promise<number | null> {
  const res = await q(`SELECT value FROM app_meta WHERE key = $1`, [`last_seen_build:${customerId}`]);
  if (res.rows.length === 0) return null;
  const parsed = Number(res.rows[0].value);
  return Number.isFinite(parsed) ? parsed : null;
}
