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

export function isCategory(v: string): v is Category {
  return (CATEGORIES as readonly string[]).includes(v);
}

export function isReserved(v: string): boolean {
  return (RESERVED_PATHS as readonly string[]).includes(v);
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isKebabCase(v: string): boolean {
  return KEBAB.test(v) && v.length >= 2 && v.length <= 64;
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

/** RFC 3339 in UTC with a trailing Z, always. */
export function iso(d: Date | string | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/\.\d{3}Z$/, (m) => m);
}

const TICKET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function newTicketCode(): string {
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += TICKET_ALPHABET[bytes[i]! % TICKET_ALPHABET.length];
  return `TKT-${out}`;
}

export function newCoverSeed(): string {
  return crypto.randomBytes(8).toString('hex');
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const COVER_COLORS = [
  '#f31a7c',
  '#146aeb',
  '#3cbd2c',
  '#ab46dd',
  '#d69712',
  '#007aff',
  '#28cd41',
  '#ff3b30',
];

/** The key colour of an event is derived once, at creation, from its cover seed. */
export function themeFromSeed(seed: string): string {
  const h = hashString(seed);
  return COVER_COLORS[h % COVER_COLORS.length]!;
}

export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

export function isIanaZone(v: string): boolean {
  if (typeof v !== 'string' || v.length === 0 || v.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

export function parseInstant(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  // Only an instant in UTC written as RFC 3339 with a trailing Z, or an
  // explicit offset, is accepted; a bare local time is not.
  if (!/^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(:\d{2})?(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ------------------------------------------------------------------ */
/* passwords                                                           */
/* ------------------------------------------------------------------ */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64!, 'base64');
    const expected = Buffer.from(hashB64!, 'base64');
    const derived = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* bearer tokens                                                       */
/* ------------------------------------------------------------------ */

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export interface TokenPayload {
  sub: number;
  role: 'host' | 'guest';
  exp: number;
}

export function signToken(secret: string, payload: Omit<TokenPayload, 'exp'>, ttlSeconds = 7 * 24 * 3600): string {
  const body: TokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const data = b64url(Buffer.from(JSON.stringify(body), 'utf8'));
  const sig = b64url(crypto.createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(secret: string, token: string): TokenPayload | null {
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = b64url(crypto.createHmac('sha256', secret).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(unb64url(data).toString('utf8')) as TokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* csv                                                                 */
/* ------------------------------------------------------------------ */

export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
