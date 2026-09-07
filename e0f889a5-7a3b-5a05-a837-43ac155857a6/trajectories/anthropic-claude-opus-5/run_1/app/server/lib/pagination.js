import { badRequest } from './errors.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// A page size may be written as page_size, pageSize or limit; all three are the
// same knob and all three are capped at MAX_PAGE_SIZE rather than quietly cut.
export function readPageSize(query) {
  const raw =
    query.page_size ?? query.pageSize ?? query.limit ?? query.per_page ?? query.perPage;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest('invalid_page_size', `Page size must be a whole number between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (n > MAX_PAGE_SIZE) {
    throw badRequest(
      'page_size_too_large',
      `Page size ${n} is above the cap of ${MAX_PAGE_SIZE}. Ask for ${MAX_PAGE_SIZE} or fewer.`,
      { max_page_size: MAX_PAGE_SIZE },
    );
  }
  return n;
}

// Keyset cursor over a stable ordering key, so a list that receives new rows
// between two reads never repeats a row and never skips one.
export function encodeCursor(parts) {
  return Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
}

export function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('shape');
    return parsed;
  } catch {
    throw badRequest('invalid_cursor', 'That cursor is not one we issued. Ask for the first page again.');
  }
}

export function page(rows, pageSize, cursorOf) {
  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;
  const next = hasMore && data.length ? encodeCursor(cursorOf(data[data.length - 1])) : null;
  return { data, next_cursor: next, has_more: hasMore };
}
