import type { PoolClient } from 'pg';
import { pool } from './db.js';
import { CATEGORIES, RESERVED_PATHS, isKebab } from './util.js';

export type NamespaceKind = 'system' | 'category' | 'event' | 'calendar' | 'account';

export interface Resolution {
  kind: NamespaceKind | null;
  slug: string;
}

/**
 * One lookup with fixed precedence: reserved system paths, then the twelve
 * category names, then events.slug, then calendars.slug, then accounts.handle.
 */
export async function resolveSlug(
  slug: string,
  client?: PoolClient,
): Promise<Resolution> {
  const s = String(slug || '').toLowerCase();
  if ((RESERVED_PATHS as readonly string[]).includes(s)) {
    return { kind: 'system', slug: s };
  }
  if ((CATEGORIES as readonly string[]).includes(s)) {
    return { kind: 'category', slug: s };
  }
  const runner = client ?? pool;
  const { rows } = await runner.query(
    `SELECT 'event' AS kind FROM events WHERE slug = $1
     UNION ALL
     SELECT 'calendar' FROM calendars WHERE slug = $1
     UNION ALL
     SELECT 'account' FROM accounts WHERE handle = $1`,
    [s],
  );
  const order: NamespaceKind[] = ['event', 'calendar', 'account'];
  for (const kind of order) {
    if (rows.some((r: { kind: string }) => r.kind === kind)) return { kind, slug: s };
  }
  return { kind: null, slug: s };
}

export type NamespaceRefusal =
  | { ok: true }
  | { ok: false; reason: 'shape' | 'reserved' | 'category' | 'taken' };

/**
 * A slug is refused when it matches a reserved path, a category name or any
 * existing handle, calendar slug or event slug. No slug is ever reused.
 */
export async function checkNamespaceFree(
  candidate: string,
  client: PoolClient,
  ignore?: { accountId?: string; calendarId?: string; eventId?: string },
): Promise<NamespaceRefusal> {
  const s = String(candidate || '').toLowerCase();
  if (!isKebab(s) || s.length < 2 || s.length > 64) return { ok: false, reason: 'shape' };
  if ((RESERVED_PATHS as readonly string[]).includes(s)) {
    return { ok: false, reason: 'reserved' };
  }
  if ((CATEGORIES as readonly string[]).includes(s)) {
    return { ok: false, reason: 'category' };
  }
  const { rows } = await client.query(
    `SELECT 1 FROM events    WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2)
     UNION ALL
     SELECT 1 FROM calendars WHERE slug = $1 AND ($3::uuid IS NULL OR id <> $3)
     UNION ALL
     SELECT 1 FROM accounts  WHERE handle = $1 AND ($4::uuid IS NULL OR id <> $4)`,
    [
      s,
      ignore?.eventId ?? null,
      ignore?.calendarId ?? null,
      ignore?.accountId ?? null,
    ],
  );
  return rows.length ? { ok: false, reason: 'taken' } : { ok: true };
}

/** Derives a free event slug from a title without ever reusing one. */
export async function deriveFreeSlug(
  base: string,
  client: PoolClient,
): Promise<string> {
  const root = base && base.length >= 2 ? base : 'event';
  for (let i = 0; i < 200; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    if ((await checkNamespaceFree(candidate, client)).ok) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}
