import crypto from 'node:crypto';
import { env } from './env.js';

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
];

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
];

export class HttpError extends Error {
  status: number;
  field?: string;
  constructor(status: number, message: string, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export const badRequest = (message: string, field?: string) => new HttpError(400, message, field);
export const notFound = () => new HttpError(404, 'Looks like you discovered a page that doesn’t exist or you don’t have access to.');
export const unauthorized = () => new HttpError(401, 'Sign in to continue.');
export const forbidden = () => new HttpError(403, 'Looks like you discovered a page that doesn’t exist or you don’t have access to.');

export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return `scrypt$${s}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(password, parts[1], expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;

export function signToken(accountId: string | number): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ sub: String(accountId), exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', env.tokenSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): { sub: string; exp: number } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', env.tokenSecret).update(payload).digest('base64url');
  if (expect.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.exp !== 'number' || data.exp * 1000 < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

const TICKET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function newTicketCode(): string {
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += TICKET_ALPHABET[bytes[i] % TICKET_ALPHABET.length];
  return `TKT-${out}`;
}

export function kebab(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export const isKebab = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 2 && s.length <= 64;

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function isIanaZone(z: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z });
    return true;
  } catch {
    return false;
  }
}

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const COVER_COLORS = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

export function themeFromSeed(seed: string): string {
  return COVER_COLORS[hashSeed(seed) % COVER_COLORS.length];
}

export function isoZ(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, '.000Z').replace('.000Z', 'Z');
}

export function parseInstant(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw badRequest(`${field} must be an RFC 3339 instant in UTC, such as 2026-01-01T18:00:00Z.`, field);
  }
  if (!/(Z|z)$/.test(value)) {
    throw badRequest(`${field} must be written in UTC with a trailing Z.`, field);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest(`${field} is not a valid instant.`, field);
  return d;
}

export function csvCell(value: string | null | undefined): string {
  const v = value ?? '';
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
