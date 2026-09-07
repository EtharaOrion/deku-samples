import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { query } from '../db.js';

const ISSUER = process.env.AUTH_ISSUER_URL;
const CLIENT_ID = process.env.AUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET;
const SESSION_SECRET =
  process.env.SESSION_SECRET || `${CLIENT_SECRET || 'ravel'}::app-session-signing-key`;

export const SESSION_HOURS = 12;

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(payloadB64) {
  return createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
}

// The app issues its own token. It never accepts an identity a caller asserts.
export function issueAppToken(claims) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ...claims,
    iat: now,
    exp: now + SESSION_HOURS * 3600,
    jti: randomUUID(),
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyAppToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

// Exchanges email and password at keycloak.
export async function authenticateAtKeycloak(email, password) {
  if (!ISSUER) throw new Error('AUTH_ISSUER_URL is not set');
  const res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: email,
      password,
      scope: 'openid profile email',
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.access_token) return null;
  const claimsPart = json.access_token.split('.')[1];
  let claims = {};
  try {
    claims = JSON.parse(Buffer.from(claimsPart, 'base64url').toString('utf8'));
  } catch { /* fall through to the account record */ }
  return {
    email: claims.email || claims.preferred_username || email,
    name: claims.name || null,
    roles: (claims.realm_access && claims.realm_access.roles) || [],
  };
}

const KNOWN_ROLES = new Set([
  'plant_operator', 'lab_analyst', 'quality_manager',
  'claims_manager', 'certificate_signer', 'auditor',
]);

export async function accountFor(email) {
  const rows = await query('SELECT * FROM account WHERE email = $1', [email]);
  return rows[0] || null;
}

export async function sessionClaimsFor(email, keycloakRoles) {
  const account = await accountFor(email);
  const roles = (keycloakRoles || []).filter((r) => KNOWN_ROLES.has(r));
  return {
    email,
    name: account ? account.name : null,
    roles: roles.length ? roles : account ? [account.role] : [],
    sites: account ? account.sites : [],
    grant_ends_on: account ? account.grant_ends_on : null,
  };
}
