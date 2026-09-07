import { badRequest } from './errors.mjs';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * A page size above the cap is refused with the cap named, rather than served
 * as a page quietly cut down to fit. `limit` is accepted as a spelling of the
 * same parameter so a caller writing limit=500 is told about the cap.
 */
export function readPageSize(query) {
  const raw = query.page_size ?? query.pageSize ?? query.limit ?? query.per_page;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest('invalid_page_size', `page_size must be a whole number between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (n > MAX_PAGE_SIZE) {
    throw badRequest('page_size_too_large', `page_size may not be above ${MAX_PAGE_SIZE}. You asked for ${n}.`);
  }
  return n;
}

/** The cursor is opaque to the caller and keyset over a stable ordering key. */
export function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
  } catch {
    throw badRequest('invalid_cursor', 'That cursor is not one we issued.');
  }
}

/**
 * Read one more row than asked for: its presence is the has_more flag and its
 * predecessor's key is the next cursor. Keyset, so rows arriving between two
 * reads never repeat a row and never skip one.
 */
export function buildPage(rows, pageSize, keyOf) {
  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore && data.length ? encodeCursor(keyOf(data[data.length - 1])) : null;
  return { data, next_cursor: nextCursor, has_more: hasMore };
}
