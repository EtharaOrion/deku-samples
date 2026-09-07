import { Hono } from 'hono';
import { q } from '../lib/db.js';
import { keycloakPassword, issueAppToken, personByEmail } from '../lib/auth.js';
import { requireSession, refuse } from '../lib/http.js';
import { appendEntry } from '../lib/records.js';

const auth = new Hono();

// Sign-in exchanges the email and password at keycloak and returns the app's own
// access_token and token_type.
auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) {
    refuse(400, 'missing_credentials', { error: 'missing_credentials', message: 'An email and a password are required. There is no signup and no password reset.' });
  }
  const kc = await keycloakPassword(email, password);
  if (!kc) {
    await appendEntry(null, { person: email, object_kind: 'session', object_ref: email, action: 'sign_in_refused', content: { reason: 'credentials_rejected' } });
    refuse(401, 'credentials_rejected', { error: 'credentials_rejected', message: 'That email and password were not accepted.' });
  }
  const person = await personByEmail(email);
  if (!person) {
    refuse(403, 'no_account', { error: 'no_account', message: 'Signup is closed. This address holds no account in the record.' });
  }
  const token = await issueAppToken(person, kc.claims);
  await appendEntry(null, { person: person.email, object_kind: 'session', object_ref: person.identifier, action: 'signed_in', content: { roles: person.roles, sites: person.sites } });
  return c.json({ ...token, email: person.email, name: person.name, roles: person.roles, sites: person.sites });
});

auth.get('/me', async (c) => {
  const session = await requireSession(c);
  const person = (await q('SELECT * FROM person WHERE lower(email) = lower($1)', [session.email]))[0];
  if (!person) refuse(403, 'no_account', { error: 'no_account', message: 'This session names no account.' });
  return c.json({
    email: person.email,
    name: person.name,
    roles: person.roles,
    sites: person.sites,
    grant_ends: String(person.grant_ends).slice(0, 10),
    expires_at: new Date(Number(session.exp) * 1000).toISOString(),
  });
});

export default auth;
