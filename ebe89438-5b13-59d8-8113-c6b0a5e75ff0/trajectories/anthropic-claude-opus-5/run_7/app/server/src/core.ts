import crypto from 'node:crypto';
import { env } from './env.js';

export const RESERVED_PATHS = [
  'api', 'app', 'login', 'signup', 'home', 'calendars', 'create', 'discover',
  'settings', 'event', 't',
];

export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai', 'running',
  'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
];

export const DISCOVERABLE_STATES = ['published', 'registration_closed'];
export const SEATED_STATUSES = ['confirmed', 'checked_in'];

// ---------------------------------------------------------------- passwords
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const dk = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
    const expected = Buffer.from(hashHex, 'hex');
    return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ tokens
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;

function sign(payload: string): string {
  return crypto.createHmac('sha256', env.tokenSecret).update(payload).digest('base64url');
}

export function issueToken(accountId: number): { token: string; expiresAt: Date } {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const body = `${accountId}.${exp}`;
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp * 1000) };
}

export function readToken(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [idRaw, expRaw, mac] = parts;
  const body = `${idRaw}.${expRaw}`;
  const expected = sign(body);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const id = Number(idRaw);
  return Number.isFinite(id) ? id : null;
}

// ------------------------------------------------------------ ticket codes
const TICKET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function newTicketCode(): string {
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += TICKET_ALPHABET[bytes[i] % TICKET_ALPHABET.length];
  return `TKT-${out}`;
}

// ------------------------------------------------------------------- slugs
export function kebab(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function isKebab(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length >= 2 && s.length <= 80;
}

export function isReservedName(slug: string): boolean {
  return RESERVED_PATHS.includes(slug) || CATEGORIES.includes(slug);
}

// ------------------------------------------------------------------ themes
/** Deterministic 32-bit hash, used for cover art and theme derivation. */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const THEME_PALETTE = [
  '#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd',
  '#d69712', '#007aff', '#28cd41', '#ff3b30',
];

export function themeFromSeed(seed: string): string {
  return THEME_PALETTE[hashString(seed) % THEME_PALETTE.length];
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const int = m ? parseInt(m[1], 16) : 0x146aeb;
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const v = lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * v);
  };
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function relLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const int = m ? parseInt(m[1], 16) : 0;
  const ch = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The whole event palette, derived once from the key colour. The server hands
 * these to the client as tokens so an event page arrives already themed and
 * never repaints from a default ground.
 */
export interface EventTheme {
  key: string;
  ground: string;
  groundSunk: string;
  ink: string;
  inkSecondary: string;
  hairline: string;
  panel: string;
  tooPale: boolean;
}

export function deriveTheme(themeHex: string): EventTheme {
  const { h } = hexToHsl(themeHex);
  const ground = hslToHex(h, 8, 94);
  const groundSunk = hslToHex(h, 10, 90);
  const ink = hslToHex(h, 100, 11);
  const rgb = (hex: string) => {
    const int = parseInt(hex.slice(1), 16);
    return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
  };
  const inkRgb = rgb(ink);
  const tooPale = contrastRatio(ground, ink) < 4.5;
  if (tooPale) {
    return {
      key: themeHex,
      ground: '#ffffff',
      groundSunk: '#fafafa',
      ink: '#151515',
      inkSecondary: 'rgba(21, 21, 21, 0.36)',
      hairline: 'rgba(21, 21, 21, 0.08)',
      panel: 'rgba(21, 21, 21, 0.04)',
      tooPale: true,
    };
  }
  return {
    key: themeHex,
    ground,
    groundSunk,
    ink,
    inkSecondary: `rgba(${inkRgb}, 0.36)`,
    hairline: `rgba(${inkRgb}, 0.08)`,
    panel: `rgba(${inkRgb}, 0.04)`,
    tooPale: false,
  };
}

// -------------------------------------------------------------------- misc
export function rfc3339(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}
