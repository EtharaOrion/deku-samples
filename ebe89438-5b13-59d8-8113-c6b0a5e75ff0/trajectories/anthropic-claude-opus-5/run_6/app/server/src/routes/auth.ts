import { Hono } from 'hono';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { hashPassword, isKebab, slugify, verifyPassword } from '../domain.js';
import { AppError } from '../errors.js';
import { issueToken } from '../auth.js';
import { claimName } from '../namespace.js';
import { parseBody, readJson } from '../shape.js';
import { serializeAccount } from '../serialize.js';
import { rateLimit } from '../ratelimit.js';

export const authRoutes = new Hono();

const emailField = z.string().trim().toLowerCase().email('Enter a valid email address.');
const passwordField = z.string().min(8, 'Use at least 8 characters.').max(200);

const signupSchema = z.object({
  email: emailField,
  password: passwordField,
  name: z.string().trim().min(1, 'Add your name so hosts know who is coming.').max(120),
});

async function freeHandleFrom(name: string, email: string): Promise<string> {
  const base = slugify(name) || slugify(email.split('@')[0]) || 'guest';
  for (let i = 0; i < 500; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (!isKebab(candidate)) continue;
    const r = await query('SELECT 1 FROM namespace_reservations WHERE slug = $1', [candidate]);
    if (r.rowCount === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Signup is open and always creates a guest. */
authRoutes.post('/signup', async (c) => {
  const body = parseBody(signupSchema, await readJson(c));
  await rateLimit(`signup:${body.email}`, 10);

  const exists = await query('SELECT 1 FROM accounts WHERE email = $1', [body.email]);
  if (exists.rowCount) {
    throw new AppError(409, 'email: An account already uses that address. Sign in instead.', { field: 'email' });
  }

  const account = await tx(async (client) => {
    const handle = await freeHandleFrom(body.name, body.email);
    await claimName(client, handle, 'account', 'That handle is already taken.');
    const r = await client.query(
      `INSERT INTO accounts (email, password_hash, display_name, handle, role)
       VALUES ($1,$2,$3,$4,'guest') RETURNING *`,
      [body.email, hashPassword(body.password), body.name, handle],
    );
    return r.rows[0];
  });

  const token = issueToken(Number(account.id));
  return c.json(
    { ...serializeAccount(account), access_token: token.token, token_type: 'Bearer', expires_in: token.expires_in },
    201,
  );
});

const loginSchema = z.object({ email: emailField, password: z.string().min(1, 'Enter your password.') });

authRoutes.post('/login', async (c) => {
  const body = parseBody(loginSchema, await readJson(c));
  await rateLimit(`login:${body.email}`, 10);

  const r = await query('SELECT * FROM accounts WHERE email = $1', [body.email]);
  const account = r.rows[0];
  if (!account || !verifyPassword(body.password, account.password_hash)) {
    throw new AppError(401, 'That email and password do not match an account. Check the address and try again.', {
      code: 'bad_credentials',
    });
  }
  const token = issueToken(Number(account.id));
  return c.json({
    access_token: token.token,
    token_type: 'Bearer',
    expires_in: token.expires_in,
    expires_at: token.expires_at,
    account: serializeAccount(account),
  });
});
