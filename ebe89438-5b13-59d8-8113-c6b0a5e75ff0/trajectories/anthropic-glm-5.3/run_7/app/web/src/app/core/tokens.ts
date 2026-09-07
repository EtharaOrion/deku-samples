export const RESERVED_PATHS = ['api', 'app', 'login', 'signup', 'home', 'calendars', 'create', 'discover', 'settings', 'event', 't'];

export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai',
  'running', 'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  family: 'Family', books: 'Books', games: 'Games', tech: 'Tech',
  'food-and-drink': 'Food and Drink', ai: 'AI', running: 'Running',
  'arts-and-culture': 'Arts and Culture', climate: 'Climate', fitness: 'Fitness',
  wellness: 'Wellness', crypto: 'Crypto',
};

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  family: 'Weekend afternoons, playground meetups and all-ages afternoons near you.',
  books: 'Reading nights, book swaps and quiet conversations about what you just finished.',
  games: 'Tabletop evenings, playtests and tournaments run by people who host them at home.',
  tech: 'Meetups, demo nights and build-together evenings for people who make things.',
  'food-and-drink': 'Supper clubs, tastings and long tables where the food is the reason.',
  ai: 'Working sessions and show-and-tell for anyone building with machine learning.',
  running: 'Easy miles, track sessions and race-day pacing with a group that waits for you.',
  'arts-and-culture': 'Galleries, print fairs, life drawing and openings worth leaving the house for.',
  climate: 'Repair cafés, clean-ups and neighbourhood projects that add up to something.',
  fitness: 'Strength circuits, mobility mornings and training blocks with room for beginners.',
  wellness: 'Breathwork, sauna evenings and slow sessions that leave you steadier than you came.',
  crypto: 'Wallet workshops, protocol talks and honest conversation about the maths.',
};

export const CATEGORY_HUES: Record<string, string> = {
  family: '#d69712', books: '#ab46dd', games: '#146aeb', tech: '#007aff',
  'food-and-drink': '#3cbd2c', ai: '#f31a7c', running: '#3cbd2c',
  'arts-and-culture': '#ab46dd', climate: '#3cbd2c', fitness: '#d69712',
  wellness: '#f31a7c', crypto: '#d69712',
};

export const STATUS_WORDS: Record<string, string> = {
  pending_approval: 'Pending approval',
  confirmed: 'Confirmed',
  waitlisted: 'Waiting list',
  declined: 'Declined',
  cancelled_by_guest: 'Cancelled',
  cancelled_by_host: 'Cancelled',
  checked_in: 'Checked in',
  draft: 'Draft',
  published: 'Published',
  registration_closed: 'Registration closed',
  cancelled: 'Cancelled',
};

export function statusWord(s: string): string {
  return STATUS_WORDS[s] ?? s;
}

/** The instant never changes; only the string it is written out as. */
export function parseInstant(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
}

export function inZone(d: Date, tz: string, opts: Record<string, string | number | boolean>): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(d);
  }
}

export function localZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

/** The same instant written in the visitor's zone, shown when the two differ. */
export function sameInstantSameZone(a: Date, tz: string, other: string): boolean {
  const o: Record<string, string> = { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' };
  return inZone(a, tz, o) === inZone(a, other, o);
}

export function zoneLabel(d: Date, tz: string): string {
  const s = inZone(d, tz, { timeZoneName: 'shortOffset' });
  const m = /GMT[^\s,]*/.exec(s);
  return m ? m[0] : tz;
}

const COVER_COLORS = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function coverSpec(seed: string) {
  const h1 = hash('a' + seed);
  const h2 = hash('b' + seed);
  const idx = h1 % COVER_COLORS.length;
  const dir = h2 % 2 === 0 ? 1 : COVER_COLORS.length - 1;
  const a = COVER_COLORS[idx];
  const b = COVER_COLORS[(idx + dir) % COVER_COLORS.length];
  return {
    angle: h1 % 360,
    stops: [a, b] as [string, string],
    r1: { x: 20 + (h2 % 60), y: 20 + ((h1 >> 5) % 60), color: a },
    r2: { x: 20 + ((h2 >> 7) % 60), y: 25 + ((h2 >> 11) % 55), color: b },
  };
}

export function kebab(v: string): string {
  return v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}
