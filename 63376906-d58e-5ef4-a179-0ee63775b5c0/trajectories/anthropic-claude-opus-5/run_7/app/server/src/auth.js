import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { q, one } from './db.js';

const ISSUER = process.env.AUTH_ISSUER_URL;
const CLIENT_ID = process.env.AUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET;

// The app's own signing secret. Derived from the deployment's own secret so a restart
// does not invalidate a session issued a minute earlier.
const APP_SECRET = new TextEncoder().encode(
  createHash('sha256').update(`ravel:${CLIENT_SECRET || ''}:${ISSUER || ''}`).digest('hex')
);

export const SESSION_SECONDS = 12 * 60 * 60; // a session expires twelve hours after issue

/** Exchanges email and password at keycloak. The app never accepts an asserted identity. */
export async function verifyPassword(email, password) {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: email,
    password
  });
  let res;
  try {
    res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    return { ok: false, reason: 'auth_unavailable' };
  }
  if (!res.ok) return { ok: false, reason: 'invalid_credentials' };
  const payload = await res.json();
  const claims = JSON.parse(Buffer.from(payload.access_token.split('.')[1], 'base64url').toString('utf8'));
  return {
    ok: true,
    email: claims.email || claims.preferred_username,
    name: claims.name,
    kc_roles: claims.realm_access?.roles || []
  };
}

export async function issueSession(email) {
  const user = await one('SELECT email, name, role, person_id FROM app_user WHERE email = $1', [email]);
  if (!user) return null;
  const grants = await q(
    'SELECT site, ends_on FROM access_grant WHERE email = $1 ORDER BY site',
    [email]
  );
  const today = new Date().toISOString().slice(0, 10);
  const sites = grants.filter((g) => g.ends_on.toISOString().slice(0, 10) >= today).map((g) => g.site);
  const access_token = await new SignJWT({
    email: user.email,
    name: user.name,
    roles: [user.role],
    sites,
    person_id: user.person_id,
    jti: randomBytes(8).toString('hex')
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('ravel')
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(APP_SECRET);
  return { access_token, token_type: 'Bearer', expires_in: SESSION_SECONDS };
}

export async function readSession(authorization) {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  if (!/^bearer$/i.test(scheme || '') || !token) return null;
  try {
    const { payload } = await jwtVerify(token, APP_SECRET, { issuer: 'ravel' });
    return {
      email: payload.email,
      name: payload.name,
      roles: payload.roles || [],
      sites: payload.sites || [],
      person_id: payload.person_id
    };
  } catch {
    return null;
  }
}

export function hasRole(session, ...roles) {
  if (!session) return false;
  return roles.some((r) => session.roles.includes(r));
}

export const ROLE_LABELS = {
  plant_operator: 'Plant operator',
  lab_analyst: 'Laboratory analyst',
  quality_manager: 'Quality manager',
  claims_manager: 'Claims manager',
  certificate_signer: 'Certificate signer',
  auditor: 'Auditor'
};
