import { Hono } from 'hono';
import { pool } from '../main.js';
import { config } from '../config.js';
import { accountByEmail, rootNamespaceTaken, query, type Account } from '../db.js';
import { hashPassword, verifyPassword, slugify, newId, log } from '../util.js';
import { accountJson } from '../serialize.js';
import { createToken, bearerFrom } from '../tokens.js';
import { requireAuth } from '../auth.js';
import { updateProfile } from '../profile.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hits = new Map<string, number[]>();

/** Sliding-window limiter. */
export function rateLimit(kind: string, ident: string, max = config.rateLimit.max, windowMs = config.rateLimit.windowMs): boolean {
  const now = Date.now();
  const key = `${kind}:${ident}`;
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  return true;
}

export function rateLimitedResponse(c: { json: (b: unknown, s?: 429) => Response }): Response {
  return c.json({
    message: `Too many attempts. The limit is ${config.rateLimit.max} requests per minute; please wait a moment and try again.`,
    rate_limit: `${config.rateLimit.max} per minute`,
  }, 429);
}

export const authRoutes = new Hono();

authRoutes.post('/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim();

  if (!email || !EMAIL_RE.test(email)) return c.json({ message: 'Enter a valid email address.', field: 'email' }, 400);
  if (!name) return c.json({ message: 'Add your name so hosts know who is coming.', field: 'name' }, 400);
  if (password.length < 8) return c.json({ message: 'Choose a password of at least 8 characters.', field: 'password' }, 400);

  if (!rateLimit('signup', email)) return rateLimitedResponse(c);

  const existing = await accountByEmail(pool, email);
  if (existing) return c.json({ message: 'An account with that email already exists. Sign in instead.', field: 'email' }, 409);

  const base = slugify(name) || 'guest';
  let handle = base;
  for (let i = 2; i < 100; i++) {
    if (!(await rootNamespaceTaken(pool, handle))) break;
    handle = `${base}-${i}`;
  }
  if (await rootNamespaceTaken(pool, handle)) {
    return c.json({ message: 'That name cannot be turned into an address. Try a different name.', field: 'name' }, 409);
  }

  const rows = await query<Account>(pool,
    `insert into accounts (id, email, password_hash, display_name, handle, role)
     values ($1,$2,$3,$4,$5,'guest') returning *`,
    [newId('acc'), email, hashPassword(password), name, handle]);
  const { token } = await createToken(pool, rows[0].id);
  log({ level: 'info', msg: 'account created', id: rows[0].id, handle });
  return c.json({ ...accountJson(rows[0]), access_token: token, token_type: 'bearer' }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!rateLimit('login', email)) return rateLimitedResponse(c);

  const account = await accountByEmail(pool, email);
  if (!account || !verifyPassword(password, account.password_hash)) {
    return c.json({ message: 'That email and password do not match. Check them and try again.' }, 401);
  }
  const { token } = await createToken(pool, account.id);
  log({ level: 'info', msg: 'login', id: account.id });
  return c.json({ ...accountJson(account), access_token: token, token_type: 'bearer' });
});

authRoutes.post('/logout', async (c) => {
  const token = bearerFrom(c.req.header('authorization'));
  if (token) await query(pool, `delete from auth_tokens where token = $1`, [token]);
  return c.json({ ok: true });
});

/** The caller's own account, at the address the contract pins. */
export const accountRoutes = new Hono();

accountRoutes.get('/me', (c) => {
  const acc = requireAuth(c);
  return c.json(accountJson(acc));
});

accountRoutes.patch('/me', async (c) => {
  const acc = requireAuth(c);
  const body = await c.req.json().catch(() => ({}));
  const result = await updateProfile(pool, acc, body);
  if (!result.ok) return c.json({ message: result.message, field: result.field }, result.status as 400);
  return c.json(accountJson(result.account));
});
