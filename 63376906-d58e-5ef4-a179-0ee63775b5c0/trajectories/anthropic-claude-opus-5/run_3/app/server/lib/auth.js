import crypto from 'node:crypto';
import { rq1 } from '../db/pool.js';

const ISSUER = process.env.AUTH_ISSUER_URL;
const CLIENT_ID = process.env.AUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET;

if (!ISSUER) throw new Error('AUTH_ISSUER_URL is not set');

// The app issues its own token rather than passing keycloak's through, so the
// session is the app's to expire. Twelve hours after issue, exactly.
const SESSION_SECONDS = 12 * 60 * 60;
const SECRET = process.env.APP_TOKEN_SECRET || crypto.createHash('sha256')
  .update(`${CLIENT_ID}:${CLIENT_SECRET}:${ISSUER}`).digest();

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function issueToken(claims) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...claims, iat: now, exp: now + SESSION_SECONDS }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return { access_token: `${header}.${body}.${sig}`, token_type: 'Bearer', expires_in: SESSION_SECONDS };
}

/** The app never accepts an identity a caller asserts: a token is only a
 *  session if this process signed it and it has not expired. */
export function verifyToken(token) {
  if (!token || token.split('.').length !== 3) return null;
  const [header, body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
  return claims;
}

/** Exchange an email and a password at keycloak. Nothing else authenticates. */
export async function passwordGrant(email, password) {
  const res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: email,
      password,
      scope: 'openid email profile'
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;
  const part = data.access_token.split('.')[1];
  const claims = JSON.parse(Buffer.from(part, 'base64url').toString());
  return {
    email: claims.email || claims.preferred_username,
    name: claims.name,
    subject: claims.sub,
    roles: claims.realm_access?.roles || []
  };
}

const KNOWN_ROLES = new Set([
  'plant_operator', 'lab_analyst', 'quality_manager', 'claims_manager',
  'certificate_signer', 'auditor'
]);

/** The scope of a grant lives in this app's own directory, alongside the date
 *  the grant ends. Nothing renews silently: a grant past its end date carries
 *  no roles at all. */
export async function sessionFor(email, kcRoles) {
  const person = await rq1('SELECT * FROM person_directory WHERE email = $1', [email]);
  if (!person) return null;
  const roles = (kcRoles || []).filter((r) => KNOWN_ROLES.has(r));
  const directoryRoles = Array.isArray(person.roles) ? person.roles : [];
  const merged = [...new Set([...roles, ...directoryRoles])].filter((r) => KNOWN_ROLES.has(r));
  const today = new Date().toISOString().slice(0, 10);
  const expired = person.grant_ends_on && String(person.grant_ends_on).slice(0, 10) < today;
  return {
    email,
    identifier: person.identifier,
    name: person.name,
    roles: expired ? [] : merged,
    sites: expired ? [] : (person.sites || []),
    grant_ends_on: String(person.grant_ends_on).slice(0, 10),
    grant_expired: !!expired
  };
}
