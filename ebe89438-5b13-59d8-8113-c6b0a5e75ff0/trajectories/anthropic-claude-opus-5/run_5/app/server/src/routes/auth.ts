import { Hono } from 'hono';
import { query } from '../db.js';
import { hashPassword, issueToken, verifyPassword } from '../crypto.js';
import { ApiError, badRequest, conflict, readBody, str, type Vars } from '../http.js';
import { CATEGORY_SET, RESERVED_SET, isKebab, slugify } from '../domain.js';
import { takeToken } from '../ratelimit.js';
import { log } from '../log.js';

const EMAIL = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

async function uniqueHandle(base: string): Promise<string> {
  let candidate = base || 'guest';
  if (!isKebab(candidate)) candidate = 'guest';
  for (let i = 0; i < 200; i++) {
    const test = i === 0 ? candidate : `${candidate}-${i + 1}`;
    if (RESERVED_SET.has(test) || CATEGORY_SET.has(test)) continue;
    const taken = await query(
      `SELECT 1 FROM accounts WHERE handle = $1
        UNION ALL SELECT 1 FROM calendars WHERE slug = $1
        UNION ALL SELECT 1 FROM events WHERE slug = $1`,
      [test],
    );
    if (taken.rowCount === 0) return test;
  }
  return `guest-${Date.now().toString(36)}`;
}

export const authRoutes = new Hono<{ Variables: Vars }>();

authRoutes.post('/signup', async (c) => {
  const body = await readBody(c);
  const emailRaw = str(body, 'email', { required: true, max: 200 })!;
  const email = emailRaw.toLowerCase();
  if (!EMAIL.test(email)) throw badRequest('Enter a valid email address.', 'email');
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) throw badRequest('Add your name so hosts know who is coming.', 'name');
  if (name.length > 120) throw badRequest('That name is too long.', 'name');
  const password = str(body, 'password', { required: true, max: 200 })!;
  if (password.length < 8) throw badRequest('Use a password of at least 8 characters.', 'password');

  const verdict = takeToken(`signup:${email}`, 10);
  if (!verdict.allowed) {
    throw new ApiError(
      429,
      `Too many attempts. The limit is ${verdict.limit} requests per minute; try again in ${verdict.retryAfterSeconds} seconds.`,
      'email',
      { rate_limit: verdict.limit, retry_after_seconds: verdict.retryAfterSeconds },
    );
  }

  const existing = await query(`SELECT 1 FROM accounts WHERE email = $1`, [email]);
  if (existing.rowCount) throw conflict('An account already uses that email address. Sign in instead.', 'email');

  const handle = await uniqueHandle(slugify(name));
  const password_hash = await hashPassword(password);
  const r = await query(
    `INSERT INTO accounts (email, password_hash, display_name, handle, role)
     VALUES ($1,$2,$3,$4,'guest')
     RETURNING id, email, display_name, handle, role, created_at`,
    [email, password_hash, name, handle],
  );
  const account = r.rows[0];
  const { token, expiresAt } = issueToken(account.id);
  log.info('account created', { account_id: account.id });
  return c.json({ ...account, access_token: token, token_type: 'bearer', expires_at: expiresAt }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await readBody(c);
  const email = (str(body, 'email', { required: true, max: 200 }) || '').toLowerCase();
  const password = str(body, 'password', { required: true, max: 200 })!;

  const verdict = takeToken(`login:${email}`, 10);
  if (!verdict.allowed) {
    throw new ApiError(
      429,
      `Too many sign-in attempts. The limit is ${verdict.limit} requests per minute; try again in ${verdict.retryAfterSeconds} seconds.`,
      'email',
      { rate_limit: verdict.limit, retry_after_seconds: verdict.retryAfterSeconds },
    );
  }

  const r = await query(
    `SELECT id, email, password_hash, display_name, handle, role, created_at FROM accounts WHERE email = $1`,
    [email],
  );
  const account = r.rows[0];
  const ok = account ? await verifyPassword(password, account.password_hash) : false;
  if (!account || !ok) {
    throw new ApiError(401, 'That email and password do not match an account. Check them and try again.', 'password');
  }
  const { token, expiresAt } = issueToken(account.id);
  log.info('login', { account_id: account.id });
  return c.json({
    access_token: token,
    token_type: 'bearer',
    expires_at: expiresAt,
    account: {
      id: account.id,
      email: account.email,
      display_name: account.display_name,
      handle: account.handle,
      role: account.role,
    },
  });
});
