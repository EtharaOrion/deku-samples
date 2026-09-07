import type { Client } from '../db.js';
import { query } from '../db.js';
import { CATEGORIES, RESERVED_PATHS } from '../domain.js';

export type NamespaceKind = 'system' | 'category' | 'event' | 'calendar' | 'account' | null;

/** One lookup with fixed precedence. */
export async function resolveSlug(slug: string): Promise<{ kind: NamespaceKind; slug: string }> {
  const s = slug.toLowerCase();
  if ((RESERVED_PATHS as readonly string[]).includes(s)) return { kind: 'system', slug: s };
  if ((CATEGORIES as readonly string[]).includes(s)) return { kind: 'category', slug: s };
  if ((await query('SELECT 1 FROM events WHERE slug = $1', [s])).rowCount)
    return { kind: 'event', slug: s };
  if ((await query('SELECT 1 FROM calendars WHERE slug = $1', [s])).rowCount)
    return { kind: 'calendar', slug: s };
  if ((await query('SELECT 1 FROM accounts WHERE handle = $1', [s])).rowCount)
    return { kind: 'account', slug: s };
  return { kind: null, slug: s };
}

export type NameTaken = 'reserved' | 'category' | 'taken' | null;

/** Whether a name in the root namespace is available, ignoring one own row. */
export async function namespaceConflict(
  c: Client | null,
  name: string,
  ignore?: { table: 'accounts' | 'calendars' | 'events'; id: string }
): Promise<NameTaken> {
  const s = name.toLowerCase();
  if ((RESERVED_PATHS as readonly string[]).includes(s)) return 'reserved';
  if ((CATEGORIES as readonly string[]).includes(s)) return 'category';
  const run = c ? (t: string, p: unknown[]) => c.query(t, p as any[]) : (t: string, p: unknown[]) => query(t, p);
  const checks: [string, string][] = [
    ['events', 'slug'],
    ['calendars', 'slug'],
    ['accounts', 'handle'],
  ];
  for (const [table, column] of checks) {
    const skip = ignore && ignore.table === table ? ignore.id : null;
    const r = await run(
      `SELECT 1 FROM ${table} WHERE ${column} = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)`,
      [s, skip]
    );
    if (r.rowCount) return 'taken';
  }
  return null;
}
