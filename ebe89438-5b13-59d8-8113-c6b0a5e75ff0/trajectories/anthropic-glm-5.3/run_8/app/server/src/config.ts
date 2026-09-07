import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { createTransport, type Transporter } from 'nodemailer';
import { Pool } from 'pg';

export const config = {
  databaseUrl: req('DATABASE_URL', 'postgresql://localhost:5432/deku'),
  smtpHost: req('SMTP_HOST', 'localhost'),
  smtpPort: int(process.env.SMTP_PORT, 1025),
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  appUrl: trimSlash(process.env.APP_PUBLIC_URL || `http://localhost:${process.env.APP_PUBLIC_PORT || 4173}`),
  port: int(process.env.PORT, 4173),
  appRoot: process.env.APP_ROOT ?? '/app',
};

function req(name: string, fallback: string): string {
  return process.env[name] || fallback;
}
function int(v: string | undefined, fallback: number): number {
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function trimSlash(v: string): string {
  return v.replace(/\/+$/, '');
}

export function log(event: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level: 'info', event, ...data });
  process.stdout.write(line + '\n');
}

export const pool = new Pool({ connectionString: config.databaseUrl, max: 16 });

let transporter: Transporter | null = null;
export function mailTransport(): Transporter {
  if (!transporter) {
    const opts: Record<string, unknown> = {
      host: config.smtpHost,
      port: config.smtpPort,
      secure: false,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 8000,
      socketTimeout: 12000,
    };
    if (config.smtpUser) {
      opts.auth = { user: config.smtpUser, pass: config.smtpPass };
    }
    transporter = createTransport(opts as never);
  }
  return transporter;
}

// ---- identifiers and codes ----
const B32 = 'abcdefghjkmnpqrstuvwxyz23456789';
export function shortId(len = 12): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += B32[bytes[i] % B32.length];
  return out;
}
export function apiToken(): string {
  return randomBytes(24).toString('base64url');
}
const TKT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newTicketCode(): string {
  const bytes = randomBytes(8);
  let body = '';
  for (let i = 0; i < 8; i++) body += TKT_ALPHABET[bytes[i] % TKT_ALPHABET.length];
  return `TKT-${body}`;
}
export const TICKET_CODE_RE = /^TKT-[A-Z0-9]{8}$/;

// ---- password hashing (scrypt, no external dependency) ----
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${key}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(password, parts[1], expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ---- misc ----
export function digest(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export const RESERVED_PATHS = new Set([
  'api', 'app', 'login', 'signup', 'home', 'calendars', 'create', 'discover', 'settings', 'event', 't',
]);

export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai', 'running',
  'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<string, { label: string; blurb: string; hue: string }> = {
  family: { label: 'Family', blurb: 'Gatherings for all ages, from park afternoons to school-night crafts.', hue: '#146aeb' },
  books: { label: 'Books', blurb: 'Reading nights, swaps and quiet conversations about what a book left behind.', hue: '#ab46dd' },
  games: { label: 'Games', blurb: 'Table nights, quick tournaments and long campaigns with new faces.', hue: '#3cbd2c' },
  tech: { label: 'Tech', blurb: 'Meetups where something gets built, demonstrated or taken apart.', hue: '#007aff' },
  'food-and-drink': { label: 'Food & Drink', blurb: 'Supper clubs, tastings and kitchens that open their doors.', hue: '#d69712' },
  ai: { label: 'AI', blurb: 'Working sessions and show-and-tell around models, agents and datasets.', hue: '#28cd41' },
  running: { label: 'Running', blurb: 'Run clubs and track sessions at every pace, all weathers.', hue: '#3cbd2c' },
  'arts-and-culture': { label: 'Arts & Culture', blurb: 'Galleries, openings, performances and the talk afterwards.', hue: '#f31a7c' },
  climate: { label: 'Climate', blurb: 'Repairs, clean-ups and planning evenings for the neighbourhood.', hue: '#007aff' },
  fitness: { label: 'Fitness', blurb: 'Strength sessions, mobility mornings and honest beginners\u2019 hours.', hue: '#28cd41' },
  wellness: { label: 'Wellness', blurb: 'Breathwork, saunas, slow walks and other ways to settle.', hue: '#ab46dd' },
  crypto: { label: 'Crypto', blurb: 'Protocol talks, hack nights and wallets opened only for coffee.', hue: '#d69712' },
};

export const IANA_ZONE_RE = /^[A-Za-z0-9+\-_]+(\/[A-Za-z0-9+\-_]+)+$|^UTC$/;
export function isValidZone(zone: string): boolean {
  if (!IANA_ZONE_RE.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function nowIso(): string {
  return new Date().toISOString();
}
