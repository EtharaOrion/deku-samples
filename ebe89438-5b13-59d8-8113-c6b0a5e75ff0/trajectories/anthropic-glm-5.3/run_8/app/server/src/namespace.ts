import type { PoolClient } from 'pg';
import { pool, RESERVED_PATHS, CATEGORIES, SLUG_RE } from './config.js';
import { bad } from './http.js';

export type ResolveKind = 'system' | 'category' | 'event' | 'calendar' | 'account' | 'root';
export type PublicKind = 'system' | 'category' | 'event' | 'calendar' | 'account';

export function classify(slug: string): ResolveKind {
  const s = slug.toLowerCase();
  if (RESERVED_PATHS.has(s)) return 'system';
  if ((CATEGORIES as readonly string[]).includes(s)) return 'category';
  return 'root';
}

export async function resolveRoot(slug: string, client?: PoolClient): Promise<{ kind: PublicKind; slug: string } | null> {
  const q = async (text: string, params: unknown[]): Promise<{ slug: string }[]> => {
    const res = client ? await client.query(text, params) : await pool.query(text, params);
    return res.rows as { slug: string }[];
  };
  const ev = await q(`SELECT slug FROM events WHERE slug = $1`, [slug]);
  if (ev.length) return { kind: 'event', slug };
  const cal = await q(`SELECT slug FROM calendars WHERE slug = $1`, [slug]);
  if (cal.length) return { kind: 'calendar', slug };
  const acct = await q(`SELECT handle FROM accounts WHERE slug = $1`.replace('slug', 'handle'), [slug]);
  if (acct.length) return { kind: 'account', slug };
  return null;
}

/** Free for use in the root namespace? Reserved paths and categories never are. */
export async function isSlugFree(slug: string, client?: PoolClient): Promise<boolean> {
  if (classify(slug) !== 'root') return false;
  if (!SLUG_RE.test(slug) || slug.length < 1 || slug.length > 60) return false;
  const res = await resolveRoot(slug, client);
  return res === null;
}

export function assertSlugShaped(slug: string, label: string): void {
  if (!SLUG_RE.test(slug) || slug.length > 60) {
    throw bad(`Write ${label} in kebab-case, like riverside-run-club.`, { slug: 'Use kebab-case.' });
  }
  if (classify(slug) !== 'root') {
    throw bad(`That address is reserved. Choose another.`, { slug: 'That address is reserved.' });
  }
}

/** Returns a caller-facing message for a slug the caller cannot have. */
export async function claimSlug(slug: string, label: string, client: PoolClient, table: 'events' | 'calendars'): Promise<void> {
  assertSlugShaped(slug, label);
  const free = await isSlugFree(slug, client);
  if (!free) {
    throw bad(table === 'calendars' ? 'That address is already taken.' : 'That address is already taken.', { slug: 'That address is already taken.' });
  }
}
