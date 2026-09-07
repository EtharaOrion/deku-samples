import crypto from 'node:crypto';

export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai',
  'running', 'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
] as const;

export const RESERVED_PATHS = [
  'api', 'app', 'login', 'signup', 'home', 'calendars', 'create',
  'discover', 'settings', 'event', 't',
] as const;

export type Category = (typeof CATEGORIES)[number];

const AUTH_SECRET =
  process.env.AUTH_SECRET || 'deku-community-calendar-signing-key-v1';

/* ---------------------------------------------------------------- passwords */

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = (stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  let actual: Buffer;
  try {
    actual = crypto.scryptSync(plain, parts[1], expected.length);
  } catch {
    return false;
  }
  return (
    expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  );
}

/* ------------------------------------------------------------------- tokens */

const b64u = (b: Buffer) => b.toString('base64url');

export function signToken(accountId: string, ttlSeconds = 60 * 60 * 24 * 7) {
  const payload = {
    sub: accountId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  const sig = b64u(
    crypto.createHmac('sha256', AUTH_SECRET).update(body).digest(),
  );
  return { token: `${body}.${sig}`, expires_at: payload.exp };
}

export type TokenState = 'valid' | 'expired' | 'invalid';

export function readToken(
  token: string | undefined,
): { state: TokenState; sub?: string } {
  if (!token) return { state: 'invalid' };
  const [body, sig] = token.split('.');
  if (!body || !sig) return { state: 'invalid' };
  const expected = b64u(
    crypto.createHmac('sha256', AUTH_SECRET).update(body).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { state: 'invalid' };
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
      return { state: 'expired' };
    }
    return { state: 'valid', sub: String(payload.sub) };
  } catch {
    return { state: 'invalid' };
  }
}

/* -------------------------------------------------------------------- slugs */

export function kebab(input: string): string {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export const isKebab = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s || '');

/* ------------------------------------------------------------ ticket codes */

const TICKET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function newTicketCode(): string {
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += TICKET_ALPHABET[bytes[i] % 36];
  return `TKT-${out}`;
}

/* ------------------------------------------------------------------- theme */

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const COVER_COLOURS = [
  '#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd',
  '#d69712', '#007aff', '#28cd41', '#ff3b30',
];

/** theme_hex is derived once at creation from cover_seed. */
export function themeHexFromSeed(seed: string): string {
  return COVER_COLOURS[hashSeed(seed) % COVER_COLOURS.length];
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const int = m ? parseInt(m[1], 16) : 0x146aeb;
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = L - c / 2;
  const to = (v: number) =>
    Math.round(Math.min(255, Math.max(0, (v + m) * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`;
}

function srgbChannel(v: number) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const int = m ? parseInt(m[1], 16) : 0;
  return (
    0.2126 * srgbChannel((int >> 16) & 255) +
    0.7152 * srgbChannel((int >> 8) & 255) +
    0.0722 * srgbChannel(int & 255)
  );
}

export function contrastRatio(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface EventTheme {
  key: string;
  ground: string;
  sunk: string;
  ink: string;
  ink_secondary: string;
  hairline: string;
  panel: string;
  too_pale: boolean;
}

/**
 * The whole palette for an event page, computed once on the server.
 * ground 8%/94%, sunk 10%/90%, ink full saturation at 11% lightness,
 * secondary ink 0.36 alpha, hairline 0.08, panel fill 0.04.
 */
export function deriveTheme(themeHex: string): EventTheme {
  const { h } = hexToHsl(themeHex);
  const ground = hslToHex(h, 8, 94);
  const sunk = hslToHex(h, 10, 90);
  const ink = hslToHex(h, 100, 11);
  const m = /^#?([0-9a-f]{6})$/i.exec(ink)!;
  const int = parseInt(m[1], 16);
  const rgb = `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
  const tooPale = contrastRatio(ground, ink) < 4.5;
  if (tooPale) {
    return {
      key: themeHex,
      ground: '#ffffff',
      sunk: '#fafafa',
      ink: '#151515',
      ink_secondary: 'rgba(21, 21, 21, 0.36)',
      hairline: 'rgba(21, 21, 21, 0.08)',
      panel: 'rgba(21, 21, 21, 0.04)',
      too_pale: true,
    };
  }
  return {
    key: themeHex,
    ground,
    sunk,
    ink,
    ink_secondary: `rgba(${rgb}, 0.36)`,
    hairline: `rgba(${rgb}, 0.08)`,
    panel: `rgba(${rgb}, 0.04)`,
    too_pale: false,
  };
}

/* --------------------------------------------------------------------- csv */

export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/* -------------------------------------------------------------- validation */

export class FieldError extends Error {
  constructor(
    public field: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const isEmail = (v: unknown) =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function isRfc3339Utc(v: unknown): boolean {
  return (
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/.test(v) &&
    !Number.isNaN(Date.parse(v))
  );
}

export function isIanaZone(v: unknown): boolean {
  if (typeof v !== 'string' || !v) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

/** Every timestamp crossing the API is RFC 3339 UTC with a trailing Z. */
export function toUtcIso(value: Date | string | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/* ------------------------------------------------------------------ logging */

export function log(level: string, event: string, fields: Record<string, unknown> = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields }) + '\n',
  );
}
