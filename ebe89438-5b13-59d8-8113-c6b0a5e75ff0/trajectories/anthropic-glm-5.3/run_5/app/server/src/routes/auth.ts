import { Hono } from 'hono';
import { pool, tx } from '../db.js';
import { authenticate, currentAccount, isValidEmail, issueToken, requireAuth, type AuthAccount } from '../auth.js';
import { hashPassword, verifyPassword } from '../crypto.js';
import { rateLimit, rateLimitMessage } from '../ratelimit.js';
import { slugify, isKebabCase } from '../slugs.js';
import { RESERVED_PATHS, CATEGORIES } from '../categories.js';
import { toRfc3339 } from '../time.js';

function accountPublic(a: Record<string, any>) {
  return {
    id: a.id,
    email: a.email,
    display_name: a.display_name,
    handle: a.handle,
    role: a.role,
    created_at: a.created_at ? toRfc3339(a.created_at) : null,
  };
}

export const authRoutes = new Hono();
export const accountRoutes = new Hono();

authRoutes.post('/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!isValidEmail(email)) return c.json({ message: 'Enter a valid email address.', field: 'email' }, 400);
  if (password.length < 8) return c.json({ message: 'Use a password of 8 characters or more.', field: 'password' }, 400);
  if (name.length < 1) return c.json({ message: 'Add your name so hosts know who is coming.', field: 'name' }, 400);

  const existing = await pool.query(`SELECT id FROM accounts WHERE lower(email) = $1`, [email]);
  if (existing.rowCount && existing.rowCount > 0) {
    return c.json({ message: 'That email already has an account. Sign in instead.', field: 'email' }, 409);
  }

  const base = slugify(name) || 'guest';
  let handle = base;
  for (let i = 0; ; i++) {
    const taken = await pool.query(
      `SELECT 1 WHERE EXISTS(SELECT 1 FROM accounts WHERE handle = $1)
          OR EXISTS(SELECT 1 FROM calendars WHERE slug = $1)
          OR EXISTS(SELECT 1 FROM events WHERE slug = $1)`,
      [handle],
    );
    if (taken.rowCount === 0) break;
    handle = `${base}-${i + 2}`;
  }

  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO accounts (email, password_hash, display_name, handle, role)
     VALUES ($1, $2, $3, $4, 'guest') RETURNING *`,
    [email, passwordHash, name, handle],
  );
  const token = await issueToken(rows[0].id);
  console.log(JSON.stringify({ level: 'info', scope: 'signup', email, ts: new Date().toISOString() }));
  return c.json({ ...accountPublic(rows[0]), access_token: token, token_type: 'bearer' }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const limit = rateLimit(`login:${email}`, 10, 60_000);
  if (!limit.ok) {
    return c.json({ message: rateLimitMessage(limit.resetAt), field: 'email', limit: '10 per minute' }, 429);
  }
  if (!isValidEmail(email)) return c.json({ message: 'Enter a valid email address.', field: 'email' }, 400);
  if (!password) return c.json({ message: 'Enter your password.', field: 'password' }, 400);
  const account = await authenticate(email, password);
  if (!account) {
    return c.json({ message: 'That email and password do not match. Check them and try again.', field: 'password' }, 401);
  }
  const token = await issueToken(account.id);
  return c.json({ ...accountPublic(account as unknown as Record<string, any>), access_token: token, token_type: 'bearer' });
});

authRoutes.post('/logout', async (c) => {
  return c.json({ ok: true });
});

// The contract pins these at /api/accounts/me.
accountRoutes.get('/me', requireAuth, async (c) => {
  return c.json(accountPublic(c.get('account') as unknown as Record<string, any>));
});

accountRoutes.patch('/me', requireAuth, async (c) => {
  const account = c.get('account');
  const body = await c.req.json().catch(() => ({}));
  const displayName = body.display_name;
  const handle = body.handle;
  if (displayName !== undefined && (typeof displayName !== 'string' || displayName.trim().length < 1)) {
    return c.json({ message: 'Add your name so hosts know who is coming.', field: 'display_name' }, 400);
  }
  if (handle !== undefined) {
    if (typeof handle !== 'string' || !isKebabCase(handle)) {
      return c.json({ message: 'A handle is lower case letters, numbers and single hyphens.', field: 'handle' }, 400);
    }
    if (isReserved(handle, RESERVED_PATHS, CATEGORIES)) {
      return c.json({ message: 'That handle is not available. Choose another.', field: 'handle' }, 409);
    }
    if (handle !== account.handle) {
      const taken = await pool.query(
        `SELECT 1 WHERE EXISTS(SELECT 1 FROM accounts WHERE handle = $1 AND id <> $2)
            OR EXISTS(SELECT 1 FROM calendars WHERE slug = $1)
            OR EXISTS(SELECT 1 FROM events WHERE slug = $1)`,
        [handle, account.id],
      );
      if (taken.rowCount && taken.rowCount > 0) {
        return c.json({ message: 'That handle is already taken.', field: 'handle' }, 409);
      }
    }
  }
  const nextName = typeof displayName === 'string' ? displayName.trim() : account.display_name;
  const nextHandle = typeof handle === 'string' ? handle : account.handle;
  const { rows } = await pool.query(
    `UPDATE accounts SET display_name = $2, handle = $3 WHERE id = $1 RETURNING *`,
    [account.id, nextName, nextHandle],
  );
  return c.json(accountPublic(rows[0]));
});

function isReserved(handle: string, reserved: readonly string[], categories: readonly string[]): boolean {
  return reserved.includes(handle) || categories.includes(handle);
}
