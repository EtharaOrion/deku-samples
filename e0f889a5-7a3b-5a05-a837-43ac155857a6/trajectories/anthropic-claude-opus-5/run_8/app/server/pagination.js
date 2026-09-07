import { badRequest } from './errors.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// A request naming a page above the cap is refused with the cap named, rather than
// quietly served a page cut down to fit.
export function pageSizeFrom(query) {
  const raw = query.page_size ?? query.pageSize ?? query.limit ?? query.per_page;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest('page_size_invalid', `page_size must be a whole number between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (n > MAX_PAGE_SIZE) {
    throw badRequest('page_size_too_large', `page_size is capped at ${MAX_PAGE_SIZE}. You asked for ${n}.`, { cap: MAX_PAGE_SIZE });
  }
  return n;
}

// Keyset cursor over a stable ordering key. Never an offset.
export function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const decoded = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (typeof decoded.k === 'string' || typeof decoded.k === 'number') return decoded.k;
    return null;
  } catch {
    throw badRequest('cursor_invalid', 'That cursor is not one we issued.');
  }
}

export function encodeCursor(key) {
  return Buffer.from(JSON.stringify({ k: String(key) }), 'utf8').toString('base64url');
}

export function page(rows, limit, keyOf) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const next = hasMore && data.length ? encodeCursor(keyOf(data[data.length - 1])) : null;
  return { data, next_cursor: next, has_more: hasMore };
}
