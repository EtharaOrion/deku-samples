export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai',
  'running', 'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
] as const;

export const RESERVED_PATHS = [
  'api', 'app', 'login', 'signup', 'home', 'calendars', 'create',
  'discover', 'settings', 'event', 't',
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  'family': 'Family', 'books': 'Books', 'games': 'Games', 'tech': 'Tech',
  'food-and-drink': 'Food and Drink', 'ai': 'AI', 'running': 'Running',
  'arts-and-culture': 'Arts and Culture', 'climate': 'Climate', 'fitness': 'Fitness',
  'wellness': 'Wellness', 'crypto': 'Crypto',
};

export const CATEGORY_HUES: Record<string, string> = {
  'family': '#007aff', 'books': '#ab46dd', 'games': '#d69712', 'tech': '#146aeb',
  'food-and-drink': '#ff3b30', 'ai': '#125dce', 'running': '#3cbd2c',
  'arts-and-culture': '#f31a7c', 'climate': '#28cd41', 'fitness': '#0546a6',
  'wellness': '#923cbe', 'crypto': '#d69712',
};

export const CATEGORY_BLURBS: Record<string, string> = {
  'family': 'Weekend afternoons, playground meetups and all-ages film nights.',
  'books': 'Reading nights, book swaps and quiet rooms full of margins.',
  'games': 'Board game cafés, tournaments and long campaigns looking for one more player.',
  'tech': 'Talks, demos and build nights for people who make things.',
  'food-and-drink': 'Supper clubs, tastings and potlucks with a theme.',
  'ai': 'Study groups, tool demos and debates about what comes next.',
  'running': 'Run clubs, track sessions and recovery jogs at every pace.',
  'arts-and-culture': 'Gallery evenings, life drawing and open rehearsals.',
  'climate': 'Repair cafés, planting days and talks with their sleeves rolled up.',
  'fitness': 'Strength circuits, swim sessions and morning movement.',
  'wellness': 'Breathwork, saunas and slow mornings by the water.',
  'crypto': 'Meetups, reading groups and protocol deep dives.',
};

export const STATUS_LABELS: Record<string, string> = {
  'pending_approval': 'Awaiting approval',
  'confirmed': 'Confirmed',
  'waitlisted': 'On waiting list',
  'declined': 'Declined',
  'cancelled_by_guest': 'Cancelled',
  'cancelled_by_host': 'Cancelled by host',
  'checked_in': 'Checked in',
  'draft': 'Draft',
  'published': 'Published',
  'registration_closed': 'Registration closed',
  'cancelled': 'Cancelled',
};

export function isCategory(slug: string): boolean {
  return (CATEGORIES as readonly string[]).includes(slug);
}

/** Time helpers: every instant is UTC RFC 3339 in, local presentation out. */

function partsOf(instant: string, zone: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: zone }).format(new Date(instant));
  } catch {
    return instant;
  }
}

export function inZone(instant: string, zone: string): string {
  return partsOf(instant, zone, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function timeInZone(instant: string, zone: string): string {
  return partsOf(instant, zone, { hour: 'numeric', minute: '2-digit' });
}

export function shortDate(instant: string, zone: string): string {
  return partsOf(instant, zone, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function localZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch { return 'UTC'; }
}

export function visitorZoneDiffers(zone: string): boolean {
  return localZoneName() !== zone;
}

export function visitorLine(instant: string): string {
  return partsOf(instant, localZoneName(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' · ' + localZoneName();
}

export function monthOf(instant: string, zone: string): string {
  return partsOf(instant, zone, { month: 'short' }).toUpperCase();
}

export function dayOf(instant: string, zone: string): string {
  return partsOf(instant, zone, { day: 'numeric' });
}

/** Deterministic cover geometry from a seed. */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const PALETTE = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

export function coverColors(seed: string): { linear: string; radial1: string; radial2: string; angle: number } {
  const a = hash32(seed || 'x');
  const b = hash32((seed || 'x') + '~');
  const i1 = a % PALETTE.length;
  const i2 = (i1 + 1 + (b % (PALETTE.length - 1))) % PALETTE.length;
  const c1 = PALETTE[i1], c2 = PALETTE[i2];
  const angle = (a >>> 8) % 360;
  const p1 = 20 + ((b >>> 4) % 60);
  const p2 = 20 + ((a >>> 12) % 60);
  return {
    linear: `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 38%, ${PALETTE[(i2 + 3) % PALETTE.length]} 72%, ${c1} 100%)`,
    radial1: `radial-gradient(circle at ${p1}% ${100 - p2}%, ${c2}66 0%, transparent 55%)`,
    radial2: `radial-gradient(circle at ${100 - p1}% ${p2}%, ${c1}66 0%, transparent 55%)`,
    angle,
  };
}

/** Deterministic QR-like scan code from a string (no runtime dependency). */
export function scanMatrix(text: string): number[][] {
  const rows = 25;
  let state = hash32(text) || 1;
  const rnd = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
  const m: number[][] = Array.from({ length: rows }, () => Array(rows).fill(0));
  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      const edge = r === 0 || r === 6 || c === 0 || c === 6;
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      m[r0 + r][c0 + c] = edge || core ? 1 : 0;
    }
  };
  finder(0, 0); finder(0, rows - 7); finder(rows - 7, 0);
  const reserved = (r: number, c: number) => {
    const inBox = (r0: number, c0: number) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
    const inTiming = (r < 8 && c < 8) || (r < 8 && c >= rows - 8) || (r >= rows - 8 && c < 8);
    return inBox(0, 0) || inBox(0, rows - 7) || inBox(rows - 7, 0) || inTiming;
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < rows; c++) if (!reserved(r, c)) m[r][c] = rnd() > 0.5 ? 1 : 0;
  return m;
}
