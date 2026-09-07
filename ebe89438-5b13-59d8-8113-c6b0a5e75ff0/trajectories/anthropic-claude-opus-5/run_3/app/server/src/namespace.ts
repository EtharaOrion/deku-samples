import { query, type Runner } from './db.js';

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

export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isKebab(s: string) {
  return typeof s === 'string' && s.length >= 1 && s.length <= 80 && KEBAB.test(s);
}

export type NamespaceKind = 'system' | 'category' | 'event' | 'calendar' | 'account';

/** One lookup, fixed precedence: reserved, category, event, calendar, account. */
export async function resolveSlug(
  slug: string,
  runner: Runner = { query }
): Promise<{ kind: NamespaceKind; slug: string } | null> {
  const s = String(slug || '').toLowerCase();
  if (RESERVED_PATHS.includes(s)) return { kind: 'system', slug: s };
  if (CATEGORIES.includes(s)) return { kind: 'category', slug: s };
  const ev = await runner.query('SELECT slug FROM events WHERE slug = $1', [s]);
  if (ev.rowCount) return { kind: 'event', slug: s };
  const cal = await runner.query('SELECT slug FROM calendars WHERE slug = $1', [s]);
  if (cal.rowCount) return { kind: 'calendar', slug: s };
  const acc = await runner.query('SELECT handle FROM accounts WHERE handle = $1', [s]);
  if (acc.rowCount) return { kind: 'account', slug: s };
  return null;
}

/** Returns a refusal reason when the name may not enter the root namespace. */
export async function namespaceRefusal(
  name: string,
  kind: 'handle' | 'calendar' | 'event',
  opts: { excludeAccountId?: string } = {}
): Promise<string | null> {
  const s = String(name || '').toLowerCase();
  const takenMsg = kind === 'handle' ? 'That handle is already taken.' : 'That address is already taken.';
  if (!isKebab(s)) {
    return kind === 'handle'
      ? 'A handle uses lowercase letters, numbers and single hyphens.'
      : 'An address uses lowercase letters, numbers and single hyphens.';
  }
  if (RESERVED_PATHS.includes(s) || CATEGORIES.includes(s)) return takenMsg;

  const ev = await query('SELECT 1 FROM events WHERE slug = $1', [s]);
  if (ev.rowCount) return takenMsg;
  const cal = await query('SELECT 1 FROM calendars WHERE slug = $1', [s]);
  if (cal.rowCount) return takenMsg;
  const acc = await query(
    opts.excludeAccountId
      ? 'SELECT 1 FROM accounts WHERE handle = $1 AND id <> $2'
      : 'SELECT 1 FROM accounts WHERE handle = $1',
    opts.excludeAccountId ? [s, opts.excludeAccountId] : [s]
  );
  if (acc.rowCount) return takenMsg;
  return null;
}

export function slugify(input: string) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Derives a free slug from a title; never reuses one already in the namespace. */
export async function deriveFreeSlug(title: string) {
  const base = slugify(title) || 'event';
  let candidate = base;
  for (let i = 0; i < 200; i++) {
    if (!(await namespaceRefusal(candidate, 'event'))) return candidate;
    candidate = `${base}-${i + 2}`.slice(0, 80);
  }
  return `${base}-${Date.now().toString(36)}`;
}
