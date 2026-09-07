import { Hono } from 'hono';
import { pool, tx } from '../db.js';
import {
  AppContext,
  handleError,
  rateLimit,
  readJson,
  requireAccount,
} from '../http.js';
import { checkNamespaceFree } from '../namespace.js';
import {
  FieldError,
  hashPassword,
  isEmail,
  kebab,
  log,
  signToken,
  verifyPassword,
} from '../util.js';

export const authRoutes = new Hono();

/** Signup is open and always creates a guest. */
authRoutes.post('/auth/signup', async (c: AppContext) => {
  try {
    const body = await readJson(c);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const name = String(body.name ?? '').trim();

    if (!isEmail(email)) throw new FieldError('email', 'Enter a valid email address.');
    if (!name) throw new FieldError('name', 'Add your name so hosts know who is coming.');
    if (password.length < 8) {
      throw new FieldError('password', 'Use a password of at least 8 characters.');
    }
    rateLimit(`signup:${email}`);

    const account = await tx(async (client) => {
      const { rows: taken } = await client.query(
        'SELECT 1 FROM accounts WHERE email = $1',
        [email],
      );
      if (taken.length) {
        throw new FieldError(
          'email',
          'An account with that email already exists. Sign in instead.',
          409,
        );
      }
      const root = kebab(name) || 'guest';
      let handle = `${root}-${Date.now().toString(36)}`;
      for (let i = 0; i < 500; i++) {
        const candidate = i === 0 ? root : `${root}-${i + 1}`;
        if ((await checkNamespaceFree(candidate, client)).ok) {
          handle = candidate;
          break;
        }
      }
      const { rows } = await client.query(
        `INSERT INTO accounts (email, password_hash, display_name, handle, role)
         VALUES ($1, $2, $3, $4, 'guest')
         RETURNING id, email, display_name, handle, role, created_at`,
        [email, hashPassword(password), name, handle],
      );
      return rows[0];
    });

    log('info', 'account_created', { account_id: account.id, role: 'guest' });
    const { token, expires_at } = signToken(account.id);
    return c.json(
      {
        id: account.id,
        email: account.email,
        display_name: account.display_name,
        handle: account.handle,
        role: account.role,
        access_token: token,
        token_type: 'Bearer',
        expires_at,
      },
      201,
    );
  } catch (err) {
    return handleError(err, c);
  }
});

authRoutes.post('/auth/login', async (c: AppContext) => {
  try {
    const body = await readJson(c);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!email) throw new FieldError('email', 'Enter a valid email address.');
    if (!password) throw new FieldError('password', 'Enter your password.');
    rateLimit(`login:${email}`);

    const { rows } = await pool.query(
      'SELECT id, email, password_hash, display_name, handle, role FROM accounts WHERE email = $1',
      [email],
    );
    const account = rows[0];
    if (!account || !verifyPassword(password, account.password_hash)) {
      log('warn', 'login_refused', { email });
      throw new FieldError(
        'password',
        'That email and password do not match an account. Check them and try again.',
        401,
      );
    }
    const { token, expires_at } = signToken(account.id);
    log('info', 'login_ok', { account_id: account.id });
    return c.json({
      access_token: token,
      token_type: 'Bearer',
      expires_at,
      account: {
        id: account.id,
        email: account.email,
        display_name: account.display_name,
        handle: account.handle,
        role: account.role,
      },
    });
  } catch (err) {
    return handleError(err, c);
  }
});

authRoutes.get('/accounts/me', async (c: AppContext) => {
  try {
    const account = await requireAccount(c);
    return c.json(account);
  } catch (err) {
    return handleError(err, c);
  }
});

/** Edits the caller alone; the body carries no account identifier. */
authRoutes.patch('/accounts/me', async (c: AppContext) => {
  try {
    const account = await requireAccount(c);
    const body = await readJson(c);

    const updated = await tx(async (client) => {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (body.display_name !== undefined) {
        const name = String(body.display_name).trim();
        if (!name) {
          throw new FieldError('display_name', 'Add your name so hosts know who is coming.');
        }
        values.push(name);
        fields.push(`display_name = $${values.length}`);
      }

      if (body.handle !== undefined) {
        const handle = String(body.handle).trim().toLowerCase();
        const check = await checkNamespaceFree(handle, client, {
          accountId: account.id,
        });
        if (!check.ok) {
          // The account keeps the handle it had when a change is refused.
          const message =
            check.reason === 'shape'
              ? 'Use lowercase letters, numbers and single hyphens.'
              : 'That handle is already taken.';
          throw new FieldError('handle', message, 409);
        }
        values.push(handle);
        fields.push(`handle = $${values.length}`);
      }

      if (!fields.length) return account;
      values.push(account.id);
      const { rows } = await client.query(
        `UPDATE accounts SET ${fields.join(', ')} WHERE id = $${values.length}
         RETURNING id, email, display_name, handle, role`,
        values,
      );
      return rows[0];
    });

    return c.json(updated);
  } catch (err) {
    return handleError(err, c);
  }
});
