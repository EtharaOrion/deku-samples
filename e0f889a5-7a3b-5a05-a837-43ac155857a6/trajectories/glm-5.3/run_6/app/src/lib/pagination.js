import { errors } from './errors.js';

// Every list endpoint accepts page_size, defaults it to 20 and caps it at 100.
// A request above the cap is refused with the cap named in the message.
// Cursors are keyset cursors over a stable ordering key.
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function parsePageSize(query, { alias = ['page_size', 'limit'] } = {}) {
  let raw;
  for (const key of alias) {
    if (query[key] !== undefined && query[key] !== '') { raw = query[key]; break; }
  }
  if (raw === undefined) return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw errors.badRequest(`page_size must be a whole number between 1 and ${MAX_PAGE_SIZE}.`, 'invalid_page_size');
  }
  if (n > MAX_PAGE_SIZE) {
    throw errors.badRequest(
      `page_size must be ${MAX_PAGE_SIZE} or less. ${n} is above the cap of ${MAX_PAGE_SIZE}.`,
      'page_size_above_cap'
    );
  }
  return n;
}

export function encodeCursor(value) {
  return Buffer.from(String(value), 'utf8').toString('base64url');
}

export function decodeCursor(cursor) {
  if (cursor === undefined || cursor === null || cursor === '') return null;
  try {
    return Buffer.from(String(cursor), 'base64url').toString('utf8');
  } catch {
    throw errors.badRequest('That cursor is not valid.', 'invalid_cursor');
  }
}

// The cursor is opaque to a caller: it carries the ordering key, encoded.
export function page(data, { hasMore, nextCursor }) {
  return {
    data,
    has_more: hasMore,
    next_cursor: hasMore && nextCursor !== null && nextCursor !== undefined
      ? encodeCursor(nextCursor)
      : null
  };
}

// A keyset cursor over a numeric ordering key. Absent means start at the top;
// anything that is not a number is refused rather than quietly ignored.
export function numericCursor(cursor) {
  const decoded = decodeCursor(cursor);
  if (decoded === null) return null;
  if (!/^-?\d+$/.test(decoded)) {
    throw errors.badRequest('That cursor is not valid.', 'invalid_cursor');
  }
  return Number(decoded);
}
