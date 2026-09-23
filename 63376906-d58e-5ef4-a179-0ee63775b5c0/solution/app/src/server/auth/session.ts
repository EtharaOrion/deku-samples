import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { ACCOUNTS, type Account } from '../db/constants.js';
import type { Role } from '../../shared/enums.js';

export interface Session {
  email: string;
  name: string;
  role: Role;
  sites: string[];
  expires_at: string;
}

interface TokenClaims {
  email: string;
  exp: number;
}

function sign(payload: string): string {
  return createHmac('sha256', config.authClientSecret).update(payload).digest('base64url');
}

export function issueSessionToken(email: string): { token: string; expires_at: string } {
  const exp = Date.now() + config.sessionHours * 60 * 60 * 1000;
  const claims: TokenClaims = { email, exp };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, expires_at: new Date(exp).toISOString() };
}

export function accountOf(email: string): Account | null {
  return ACCOUNTS[email] ?? null;
}

export function readSessionToken(token: string): Session | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenClaims;
  } catch {
    return null;
  }
  if (typeof claims.email !== 'string' || typeof claims.exp !== 'number') return null;
  if (claims.exp < Date.now()) return null;
  const account = accountOf(claims.email);
  if (!account) return null;
  return {
    email: claims.email,
    name: account.name,
    role: account.role,
    sites: account.sites,
    expires_at: new Date(claims.exp).toISOString(),
  };
}

interface IdentityOutcome {
  ok: boolean;
  status: number;
  detail: string;
}

/** Exchanges email and password at the identity provider (resource-owner password grant). */
export async function verifyCredentials(email: string, password: string): Promise<IdentityOutcome> {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: config.authClientId,
    client_secret: config.authClientSecret,
    username: email,
    password,
    scope: 'openid',
  });
  let response: Response;
  try {
    response = await fetch(`${config.authIssuerUrl}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (error) {
    return { ok: false, status: 503, detail: `identity provider unreachable: ${String(error)}` };
  }
  if (response.status === 200) return { ok: true, status: 200, detail: 'authenticated' };
  return { ok: false, status: 401, detail: 'the identity provider refused these credentials' };
}
