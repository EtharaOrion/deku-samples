import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';

type Argon2 = {
  hash: (p: string, o?: Record<string, unknown>) => Promise<string>;
  verify: (h: string, p: string) => Promise<boolean>;
};

let argon: Argon2 | null = null;
try {
  // Native binding where it is available.
  const mod = (await import('@node-rs/argon2')) as unknown as Argon2;
  if (typeof mod.hash === 'function' && typeof mod.verify === 'function') argon = mod;
} catch {
  argon = null;
}

/** Pure-JavaScript fallback: pbkdf2 with a per-hash salt. Only used if the native hash is unavailable. */
const FALLBACK_PREFIX = 'pbkdf2$';
async function fallbackHash(password: string): Promise<string> {
  const { pbkdf2 } = await import('node:crypto');
  const salt = randomBytes(16);
  const dk = pbkdf2(password, salt, 120_000, 32, 'sha256');
  return `${FALLBACK_PREFIX}${salt.toString('hex')}$${dk.toString('hex')}`;
}

async function fallbackVerify(hash: string, password: string): Promise<boolean> {
  const { pbkdf2, timingSafeEqual: tse } = await import('node:crypto');
  const [tag, saltHex, wantHex] = hash.split('$');
  if (tag !== 'pbkdf2' || !saltHex || !wantHex) return false;
  const got = pbkdf2(password, Buffer.from(saltHex, 'hex'), 120_000, 32, 'sha256');
  const want = Buffer.from(wantHex, 'hex');
  return got.length === want.length && tse(got, want);
}

/** A modern password hash. Argon2id where available. */
export async function hashPassword(password: string): Promise<string> {
  if (argon) return argon.hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  return fallbackHash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (hash.startsWith(FALLBACK_PREFIX)) return fallbackVerify(hash, password);
  if (argon) return argon.verify(hash, password);
  return false;
}

/* ---------------------------------- tokens --------------------------------- */

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

function secret(): string {
  return process.env.TOKEN_SECRET || process.env.DATABASE_URL || 'vela-dev-token-secret';
}

export type TokenPayload = { sub: number; email: string; exp: number };

export function issueToken(customerId: number, email: string): { token: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload: TokenPayload = { sub: customerId, email, exp };
  const body = b64url(JSON.stringify(payload));
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function readToken(token: string | undefined | null): TokenPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig ?? '');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    // Identifiers arrive as strings from the database; the number is what matters.
    const sub = Number(payload.sub);
    if (!Number.isFinite(sub) || sub < 1) return null;
    return { ...payload, sub };
  } catch {
    return null;
  }
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
