import { Hono } from 'hono';
import { db } from '../db/client.js';
import { hashPassword, verifyPassword, id as newId } from '../lib/util.js';
import { issueToken } from '../lib/auth.js';
import { rateLimit, RATE_LIMIT_MESSAGE } from '../lib/ratelimit.js';
import { checkNamespace } from '../lib/namespace.js';
import { z } from 'zod';

export const authRoutes = new Hono();

const passwordOK = (pw: string) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 200;

authRoutes.post('/signup', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const schema = z.object({
    email: z.string().trim().min(3),
    password: z.string().min(8),
    name: z.string().trim().min(1),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join('.') || 'email';
    const message =
      field === 'email' ? `Enter a valid email address.` :
      field === 'name' ? `Add your name so hosts know who is coming.` :
      `Choose a password of at least 8 characters.`;
    return c.json({ field, message }, 400);
  }
  const { email, password, name } = parsed.data;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ field: 'email', message: `Enter a valid email address.` }, 400);
  }
  const exists = await db.query(`SELECT 1 FROM accounts WHERE email = lower($1)`, [email]);
  if (exists.rowCount) {
    return c.json({ field: 'email', message: `An account with that email already exists. Sign in instead.` }, 409);
  }
  const accountId = newId();
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'guest';
  let handle = base;
  let n = 1;
  while (!(await checkNamespace(handle, 'handle')).ok) {
    handle = `${base}-${n++}`;
    if (n > 50) { handle = `${base}-${accountId.slice(0, 6)}`; break; }
  }
  const password_hash = await hashPassword(password);
  await db.query(
    `INSERT INTO accounts (id, email, password_hash, display_name, handle, role, created_at)
     VALUES ($1, lower($2), $3, $4, $5, 'guest', now())`,
    [accountId, email, password_hash, name, handle]
  );
  const { rows } = await db.query(`SELECT id, email, display_name, handle, role, created_at FROM accounts WHERE id=$1`, [accountId]);
  const account = rows[0];
  const { token } = await issueToken(accountId);
  return c.json({ ...account, access_token: token, token_type: 'bearer' }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const key = `login:${email || 'none'}`;
  if (!(await rateLimit(key, 10, 60))) {
    return c.json({ message: RATE_LIMIT_MESSAGE, field: 'email' }, 429);
  }
  if (!email || !password) {
    return c.json({ field: 'email', message: `Enter your email and password to continue.` }, 400);
  }
  const { rows } = await db.query(
    `SELECT id, email, password_hash, display_name, handle, role FROM accounts WHERE email = $1`, [email]
  );
  const row = rows[0];
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ field: 'email', message: `That email and password combination is not right. Try again.` }, 401);
  }
  const { token } = await issueToken(row.id);
  return c.json({
    access_token: token, token_type: 'bearer',
    account: { id: row.id, email: row.email, display_name: row.display_name, handle: row.handle, role: row.role },
  });
});

authRoutes.post('/logout', async (c) => {
  return c.json({ ok: true });
});
