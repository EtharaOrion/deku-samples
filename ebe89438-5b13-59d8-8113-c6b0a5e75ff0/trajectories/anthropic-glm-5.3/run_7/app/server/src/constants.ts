export const RESERVED_PATHS = new Set([
  'api', 'app', 'login', 'signup', 'home', 'calendars', 'create',
  'discover', 'settings', 'event', 't',
]);

export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai',
  'running', 'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  'family': 'Family',
  'books': 'Books',
  'games': 'Games',
  'tech': 'Tech',
  'food-and-drink': 'Food and Drink',
  'ai': 'AI',
  'running': 'Running',
  'arts-and-culture': 'Arts and Culture',
  'climate': 'Climate',
  'fitness': 'Fitness',
  'wellness': 'Wellness',
  'crypto': 'Crypto',
};

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'family': 'Weekend afternoons, playground meetups and all-ages afternoons near you.',
  'books': 'Reading nights, book swaps and quiet conversations about what you just finished.',
  'games': 'Tabletop evenings, playtests and tournaments run by people who host them at home.',
  'tech': 'Meetups, demo nights and build-together evenings for people who make things.',
  'food-and-drink': 'Supper clubs, tastings and long tables where the food is the reason.',
  'ai': 'Working sessions and show-and-tell for anyone building with machine learning.',
  'running': 'Easy miles, track sessions and race-day pacing with a group that waits for you.',
  'arts-and-culture': 'Galleries, print fairs, life drawing and openings worth leaving the house for.',
  'climate': 'Repair cafés, clean-ups and neighbourhood projects that add up to something.',
  'fitness': 'Strength circuits, mobility mornings and training blocks with room for beginners.',
  'wellness': 'Breathwork, sauna evenings and slow sessions that leave you steadier than you came.',
  'crypto': 'Wallet workshops, protocol talks and honest conversation about the maths.',
};

export const CATEGORY_HUES: Record<string, string> = {
  'family': '#d69712',
  'books': '#ab46dd',
  'games': '#146aeb',
  'tech': '#007aff',
  'food-and-drink': '#3cbd2c',
  'ai': '#f31a7c',
  'running': '#3cbd2c',
  'arts-and-culture': '#ab46dd',
  'climate': '#3cbd2c',
  'fitness': '#d69712',
  'wellness': '#f31a7c',
  'crypto': '#d69712',
};

export const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const HEX_RE = /^#[0-9a-f]{6}$/;
export const IANA_RE = /^[A-Za-z_][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+$|^[A-Za-z]{2,6}$/;

const SEAT_STATUSES = new Set(['confirmed', 'checked_in']);

export const isSeatStatus = (s: string) => SEAT_STATUSES.has(s);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/** Deterministic 32-bit FNV-1a hash, used for cover generation. */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The theme key colour derived once, at creation, from the cover seed. */
const PALETTE = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

export function themeHexFromSeed(seed: string): string {
  return PALETTE[hash32('theme:' + seed) % PALETTE.length];
}

export function ticketCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return 'TKT-' + out;
}

export function randomToken(bytes = 32): string {
  const buf = Buffer.alloc(bytes);
  crypto.getRandomValues(buf);
  return buf.toString('base64url');
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
