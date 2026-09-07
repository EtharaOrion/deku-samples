import { createHash, randomBytes } from 'node:crypto';

export function newOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

// Bearer tokens and order access tokens are stored only as digests, so a copy of
// the database is not a set of live credentials.
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export const TOKEN_TTL_HOURS = Number(process.env.AUTH_TOKEN_TTL_HOURS || 72);
