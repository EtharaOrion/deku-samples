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

export type Category = (typeof CATEGORIES)[number];

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

export const SEED_PASSWORD = 'deku-demo-pw-2026';

export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isKebab(s: string) {
  return KEBAB.test(s) && s.length >= 2 && s.length <= 64;
}

export function isReserved(slug: string) {
  return (RESERVED_PATHS as readonly string[]).includes(slug) ||
    (CATEGORIES as readonly string[]).includes(slug);
}

/** password hashing: scrypt, salted, stored as scrypt$N$r$p$salt$hash */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const dk = crypto.scryptSync(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, N, r, p, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const dk = crypto.scryptSync(password, Buffer.from(salt, 'base64'), 32, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    const expected = Buffer.from(hash, 'base64');
    return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}

const TICKET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function newTicketCode(): string {
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += TICKET_ALPHABET[bytes[i] % TICKET_ALPHABET.length];
  return `TKT-${out}`;
}

export function hash32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export const COVER_COLOURS = [
  '#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd',
  '#d69712', '#007aff', '#28cd41', '#ff3b30',
];

/** theme_hex is derived once, at creation, from cover_seed */
export function themeFromSeed(seed: string): string {
  return COVER_COLOURS[hash32(seed) % COVER_COLOURS.length];
}

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return base || 'event';
}

export type RegistrationStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'waitlisted'
  | 'declined'
  | 'cancelled_by_guest'
  | 'cancelled_by_host'
  | 'checked_in';

export const STATUS_ORDER: RegistrationStatus[] = [
  'cancelled_by_guest',
  'cancelled_by_host',
  'checked_in',
  'confirmed',
  'declined',
  'pending_approval',
  'waitlisted',
];

export type MailKind =
  | 'confirmed'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'waitlisted'
  | 'promoted'
  | 'event_cancelled'
  | 'event_updated';

export function subjectFor(kind: MailKind, title: string): string {
  switch (kind) {
    case 'confirmed': return `You're going to ${title}`;
    case 'pending': return `Your request to join ${title}`;
    case 'approved': return `You're in: ${title}`;
    case 'declined': return `About your request to join ${title}`;
    case 'waitlisted': return `You're on the waiting list for ${title}`;
    case 'promoted': return `A spot opened up for ${title}`;
    case 'event_cancelled': return `${title} has been cancelled`;
    case 'event_updated': return `An update to ${title}`;
  }
}

export function formatInZone(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}
