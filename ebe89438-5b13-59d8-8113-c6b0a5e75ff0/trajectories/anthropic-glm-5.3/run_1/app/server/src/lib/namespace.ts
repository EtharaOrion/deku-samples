import { db } from '../db/client.js';
import { KEBAB_RE } from './util.js';

export const RESERVED_PATHS = [
  'api', 'app', 'login', 'signup', 'home', 'calendars', 'create', 'discover',
  'settings', 'event', 't',
];

export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai', 'running',
  'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export interface NamespaceVerdict {
  ok: boolean;
  reason?: string;
  message?: string;
}

/**
 * One root namespace: reserved paths, the twelve categories, event slugs,
 * calendar slugs and account handles. A name colliding with any of them is
 * refused, and no slug is ever reused.
 */
export async function checkNamespace(value: string, kind: 'event' | 'calendar' | 'handle', selfId?: string): Promise<NamespaceVerdict> {
  const v = value.toLowerCase();
  if (RESERVED_PATHS.includes(v)) {
    return { ok: false, message: `That address is reserved.` };
  }
  if (isCategory(v)) {
    return { ok: false, message: kind === 'handle'
      ? `That handle is a category name.`
      : `That address is a category name.` };
  }
  if (!KEBAB_RE.test(v) || v.length < 1 || v.length > 64) {
    return { ok: false, message: kind === 'handle'
      ? `Handles use lowercase letters, numbers and single hyphens.`
      : `Addresses use lowercase letters, numbers and single hyphens.` };
  }
  const { rows } = await db.query(
    `SELECT
       (SELECT slug FROM events WHERE lower(slug) = $1 LIMIT 1)   AS event_slug,
       (SELECT slug FROM calendars WHERE lower(slug) = $1 LIMIT 1) AS calendar_slug,
       (SELECT handle FROM accounts WHERE lower(handle) = $1 AND ($2::text IS NULL OR id <> $2) LIMIT 1) AS handle_row`,
    [v, selfId ?? null]
  );
  const r = rows[0];
  if (r.event_slug || r.calendar_slug || r.handle_row) {
    return { ok: false, message: kind === 'handle'
      ? `That handle is already taken.`
      : `That address is already taken.` };
  }
  return { ok: true };
}

/** Fixed precedence for one slug: system, category, event, calendar, account. */
export async function resolveSlug(slug: string): Promise<{ kind: string; slug: string } | null> {
  const v = slug.toLowerCase();
  if (RESERVED_PATHS.includes(v)) return { kind: 'system', slug: v };
  if (isCategory(v)) return { kind: 'category', slug: v };
  const { rows } = await db.query(
    `SELECT
       (SELECT jsonb_build_object('kind','event','slug',slug) FROM events WHERE lower(slug)=$1 LIMIT 1) AS hit
      `,
    [v]
  );
  if (rows[0]?.hit) return rows[0].hit;
  const cal = await db.query(`SELECT slug FROM calendars WHERE lower(slug)=$1 LIMIT 1`, [v]);
  if (cal.rows[0]) return { kind: 'calendar', slug: cal.rows[0].slug };
  const acc = await db.query(`SELECT handle AS slug FROM accounts WHERE lower(handle)=$1 LIMIT 1`, [v]);
  if (acc.rows[0]) return { kind: 'account', slug: acc.rows[0].slug };
  return null;
}
