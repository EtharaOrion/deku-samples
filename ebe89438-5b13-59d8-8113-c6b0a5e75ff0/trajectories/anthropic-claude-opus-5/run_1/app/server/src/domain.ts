import crypto from 'node:crypto';

export const CATEGORIES = [
  'family',
  'books',
  'games',
  'tech',
  'food-and-drink',
  'ai',
  'running',
  'arts-and-culture',
  'climate',
  'fitness',
  'wellness',
  'crypto',
] as const;

export const RESERVED_PATHS = [
  'api',
  'app',
  'login',
  'signup',
  'home',
  'calendars',
  'create',
  'discover',
  'settings',
  'event',
  't',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isKebab(s: string): boolean {
  return KEBAB.test(s) && s.length >= 2 && s.length <= 64;
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const COVER_COLOURS = [
  '#f31a7c',
  '#146aeb',
  '#3cbd2c',
  '#ab46dd',
  '#d69712',
  '#007aff',
  '#28cd41',
  '#ff3b30',
];

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Key colour derived once, at creation, from the cover seed. */
export function themeHexFromSeed(seed: string): string {
  const h = hashSeed(seed);
  return COVER_COLOURS[h % COVER_COLOURS.length];
}

export function randomTicketCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return `TKT-${out}`;
}

export function newCoverSeed(): string {
  return crypto.randomBytes(8).toString('hex');
}

/* ---------- password hashing (scrypt) ---------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

/* ---------- bearer tokens (HMAC-signed, self-contained) ---------- */

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

export function signToken(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 14
): { token: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, exp }));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return { token: `${header}.${body}.${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyToken(token: string, secret: string): Record<string, any> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expect = crypto
    .createHmac('sha256', secret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest('base64url');
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ---------- mail subjects ---------- */

export const SUBJECTS = {
  confirmed: (title: string) => `You're going to ${title}`,
  pending: (title: string) => `Your request to join ${title}`,
  approved: (title: string) => `You're in: ${title}`,
  declined: (title: string) => `About your request to join ${title}`,
  waitlisted: (title: string) => `You're on the waiting list for ${title}`,
  promoted: (title: string) => `A spot opened up for ${title}`,
  cancelled: (title: string) => `${title} has been cancelled`,
  updated: (title: string) => `Details changed for ${title}`,
};
