import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { one } from './db.js';

const ISSUER = process.env.AUTH_ISSUER_URL;
const CLIENT_ID = process.env.AUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET;
if (!ISSUER) throw new Error('AUTH_ISSUER_URL is not set');

// The app signs its own token. It never accepts an identity a caller asserts.
const SECRET = new TextEncoder().encode(
  process.env.APP_TOKEN_SECRET ||
    createHash('sha256').update(`ravel:${CLIENT_SECRET || randomBytes(32).toString('hex')}`).digest('hex'),
);
export const SESSION_HOURS = 12;

export async function keycloakPassword(email, password) {
  const res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: email,
      password,
      scope: 'openid email profile',
    }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body.access_token) return null;
  const claims = JSON.parse(
    Buffer.from(body.access_token.split('.')[1], 'base64url').toString('utf8'),
  );
  return {
    email: claims.email || claims.preferred_username,
    name: claims.name,
    roles: claims.realm_access?.roles || [],
    subject: claims.sub,
  };
}

export async function issueAppToken(identity) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email: identity.email,
    name: identity.name,
    roles: identity.roles,
    sites: identity.sites,
    identifier: identity.identifier,
    grant_ends_on: identity.grant_ends_on,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setIssuer('ravel')
    .setExpirationTime(now + SESSION_HOURS * 3600)
    .sign(SECRET);
}

export async function readAppToken(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: 'ravel' });
    return payload;
  } catch {
    return null;
  }
}

const APP_ROLES = new Set([
  'plant_operator',
  'lab_analyst',
  'quality_manager',
  'claims_manager',
  'certificate_signer',
  'auditor',
  'collector',
  'converter',
]);

export async function personFor(email) {
  return one('select * from person where lower(email) = lower($1)', [email]);
}

export async function sessionFromIdentity(identity) {
  const person = await personFor(identity.email);
  const roles = (person ? [person.role] : identity.roles.filter((r) => APP_ROLES.has(r)));
  return {
    email: identity.email,
    name: person?.name || identity.name,
    identifier: person?.identifier || identity.email,
    roles,
    sites: person?.sites || [],
    grant_ends_on: person?.grant_ends_on
      ? new Date(person.grant_ends_on).toISOString().slice(0, 10)
      : null,
  };
}

export const hasRole = (session, ...roles) =>
  !!session && roles.some((r) => session.roles?.includes(r));

export const bodyHash = (body) =>
  createHash('sha256').update(typeof body === 'string' ? body : JSON.stringify(body ?? null)).digest('hex');
