import { Hono, type Context } from 'hono';
import type { AppEnv } from '../auth/guard.js';
import { accountOf, issueSessionToken, verifyCredentials } from '../auth/session.js';
import { GRANT_ENDS } from '../db/constants.js';
import { json, read, type Body } from './context.js';

export const authRoutes = new Hono<AppEnv>();

async function readLogin(c: Context<AppEnv>): Promise<Body | null> {
  try {
    const body = (await c.req.json()) as unknown;
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Body) : null;
  } catch {
    return null;
  }
}

authRoutes.post('/auth/login', async (c) => {
  const body = await readLogin(c);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) return json({ error: 'invalid_payload', detail: 'email and password are required' }, 400);
  const account = accountOf(email);
  if (!account) return json({ error: 'account_not_granted', detail: `${email} holds no grant in this application` }, 403);
  const verdict = await verifyCredentials(email, password);
  if (!verdict.ok) return json({ error: 'credentials_rejected', detail: verdict.detail }, verdict.status);
  const session = issueSessionToken(email);
  return json({
    access_token: session.token,
    token_type: 'Bearer',
    expires_at: session.expires_at,
    email,
    name: account.name,
    roles: [account.role],
    sites: account.sites,
  });
});

authRoutes.get('/auth/me', read(async (_c, session) =>
  json({
    email: session.email,
    name: session.name,
    roles: [session.role],
    sites: session.sites,
    grant_ends: GRANT_ENDS,
    expires_at: session.expires_at,
  }),
));

for (const closed of ['/auth/signup', '/auth/register', '/auth/reset', '/auth/forgot']) {
  authRoutes.all(closed, () => json({ error: 'signup_closed', detail: 'Accounts are issued by the identity provider only.' }, 404));
}
