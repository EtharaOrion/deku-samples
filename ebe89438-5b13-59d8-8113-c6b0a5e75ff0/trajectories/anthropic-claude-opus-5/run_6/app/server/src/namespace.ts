import type { Client } from './db.js';
import { query } from './db.js';
import { CATEGORIES, isKebab, isReserved, RESERVED_PATHS } from './domain.js';

export type ResolveKind = 'system' | 'category' | 'event' | 'calendar' | 'account';

/** One lookup with fixed precedence: system, category, event, calendar, account. */
export async function resolveSlug(slug: string): Promise<{ kind: ResolveKind; slug: string } | null> {
  const s = slug.toLowerCase();
  if ((RESERVED_PATHS as readonly string[]).includes(s)) return { kind: 'system', slug: s };
  if ((CATEGORIES as readonly string[]).includes(s)) return { kind: 'category', slug: s };
  const ev = await query('SELECT slug FROM events WHERE slug = $1', [s]);
  if (ev.rowCount) return { kind: 'event', slug: s };
  const cal = await query('SELECT slug FROM calendars WHERE slug = $1', [s]);
  if (cal.rowCount) return { kind: 'calendar', slug: s };
  const acc = await query('SELECT handle FROM accounts WHERE handle = $1', [s]);
  if (acc.rowCount) return { kind: 'account', slug: s };
  return null;
}

export type NamespaceRefusal = { reason: string } | null;

/**
 * Claims a name in the one root namespace. `namespace_reservations` keeps every
 * name that has ever been taken, so no slug is ever reused even after deletion.
 */
export async function claimName(
  c: Client,
  slug: string,
  kind: string,
  takenMessage: string,
): Promise<void> {
  const s = slug.toLowerCase();
  if (!isKebab(s)) {
    const e: any = new Error('Use lowercase words joined by single hyphens.');
    e.status = 422; e.field = 'slug'; throw e;
  }
  if (isReserved(s)) {
    const e: any = new Error(takenMessage);
    e.status = 409; e.field = 'slug'; throw e;
  }
  const r = await c.query(
    `INSERT INTO namespace_reservations (slug, kind) VALUES ($1,$2)
     ON CONFLICT (slug) DO NOTHING RETURNING slug`,
    [s, kind],
  );
  if (r.rowCount === 0) {
    const e: any = new Error(takenMessage);
    e.status = 409; e.field = 'slug'; throw e;
  }
}

export async function nameIsFree(c: Client, slug: string): Promise<boolean> {
  const s = slug.toLowerCase();
  if (isReserved(s)) return false;
  const r = await c.query('SELECT 1 FROM namespace_reservations WHERE slug = $1', [s]);
  return r.rowCount === 0;
}

/** Backfills reservations for anything already in the tables. */
export async function syncReservations() {
  await query(`INSERT INTO namespace_reservations (slug, kind)
               SELECT handle, 'account' FROM accounts ON CONFLICT DO NOTHING`);
  await query(`INSERT INTO namespace_reservations (slug, kind)
               SELECT slug, 'calendar' FROM calendars ON CONFLICT DO NOTHING`);
  await query(`INSERT INTO namespace_reservations (slug, kind)
               SELECT slug, 'event' FROM events ON CONFLICT DO NOTHING`);
}
