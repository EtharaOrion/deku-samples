import crypto from 'node:crypto';

const SCOPES = {
  plant_operator: ['plant'],
  lab_analyst: ['plant'],
  quality_manager: ['plant'],
  claims_manager: ['plant'],
  certificate_signer: ['plant'],
  auditor: ['plant']
};

export async function exchangePassword(db, email, password) {
  const issuer = process.env.AUTH_ISSUER_URL;
  const clientId = process.env.AUTH_CLIENT_ID;
  const clientSecret = process.env.AUTH_CLIENT_SECRET;
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username: email,
    password,
    scope: 'openid email profile'
  });
  const res = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) return null;
  const json = await res.json();
  // Verify the caller's identity against the issuer rather than trusting a claim.
  const intros = await fetch(`${issuer}/protocol/openid-connect/token/introspect`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: json.access_token, client_id: clientId, client_secret: clientSecret })
  });
  if (!intros.ok || !(await intros.json()).active) return null;

  const accounts = await db.query('SELECT * FROM app_account WHERE email=$1', [email]);
  if (!accounts.rows.length) return null;
  const account = accounts.rows[0];

  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 12 * 3600 * 1000);
  await db.query(
    `INSERT INTO app_session (token,email,roles,sites,expires_at,created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [token, email, JSON.stringify(account.roles), JSON.stringify(account.sites), expires, now]);
  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: 12 * 3600,
    email,
    roles: account.roles,
    sites: account.sites,
    name: account.name
  };
}

export function bearer(c) {
  const h = c.req.header('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function currentSession(c) {
  const db = c.get('db');
  const token = bearer(c);
  if (!token) return null;
  const r = await db.query('SELECT * FROM app_session WHERE token=$1', [token]);
  if (!r.rows.length) return null;
  const s = r.rows[0];
  if (new Date(s.expires_at).getTime() < Date.now()) {
    await db.query('DELETE FROM app_session WHERE token=$1', [token]);
    return null;
  }
  const accounts = await db.query('SELECT * FROM app_account WHERE email=$1', [s.email]);
  if (!accounts.rows.length) return null;
  const a = accounts.rows[0];
  return {
    email: s.email,
    roles: a.roles,
    sites: a.sites,
    name: a.name,
    token
  };
}

export function hasRole(session, ...roles) {
  if (!session) return false;
  return roles.some((r) => session.roles.includes(r));
}

export function siteInScope(session, site) {
  if (!session) return false;
  return (session.sites || []).includes(site);
}

export function unauthorized() {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

export function forbidden(reason) {
  return Response.json({ error: 'forbidden', reason: reason || 'role_not_permitted' }, { status: 403 });
}
