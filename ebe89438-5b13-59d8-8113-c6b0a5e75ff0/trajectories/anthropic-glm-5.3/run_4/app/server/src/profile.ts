import type { Pool } from 'pg';
import type { Account } from './db.js';
import { rootNamespaceTaken, query } from './db.js';
import { isKebabCase } from './util.js';

export type ProfileResult =
  | { ok: true; account: Account }
  | { ok: false; message: string; field?: string; status: number };

export async function updateProfile(pool: Pool, account: Account, body: Record<string, unknown>): Promise<ProfileResult> {
  const displayName = body.display_name !== undefined ? String(body.display_name).trim() : undefined;
  const handle = body.handle !== undefined ? String(body.handle).trim().toLowerCase() : undefined;

  if (displayName !== undefined && !displayName) {
    return { ok: false, message: 'Add your name so hosts know who is coming.', field: 'display_name', status: 400 };
  }
  if (handle !== undefined && !isKebabCase(handle)) {
    return { ok: false, message: 'A handle is lower-case letters, digits and single dashes.', field: 'handle', status: 400 };
  }

  if (handle !== undefined && handle !== account.handle) {
    const taken = await rootNamespaceTaken(pool, handle);
    if (taken) {
      const reason = taken === 'reserved' ? 'That handle is reserved.'
        : taken === 'category' ? 'That handle matches a category name.'
        : 'That handle is already taken.';
      return { ok: false, message: reason, field: 'handle', status: 409 };
    }
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  if (displayName !== undefined) {
    values.push(displayName);
    sets.push(`display_name = $${values.length}`);
  }
  if (handle !== undefined) {
    values.push(handle);
    sets.push(`handle = $${values.length}`);
  }
  if (sets.length === 0) return { ok: true, account };

  values.push(account.id);
  const rows = await query<Account>(pool,
    `update accounts set ${sets.join(', ')} where id = $${values.length} returning *`, values);
  return { ok: true, account: rows[0] };
}
