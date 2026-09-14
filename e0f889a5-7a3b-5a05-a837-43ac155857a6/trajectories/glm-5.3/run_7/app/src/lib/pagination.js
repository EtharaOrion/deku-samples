// Pagination: page_size defaults to 20, is capped at 100, and a request above
// the cap is refused with the cap named in the message. Cursors are keyset
// cursors over a stable ordering key, base64url encoded, opaque to callers.

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class PaginationError extends Error {
  constructor(message) {
    super(message);
    this.code = 'page_size_too_large';
    this.status = 400;
  }
}

export function parsePageSize(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new PaginationError(`page_size must be a whole number between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (n > MAX_PAGE_SIZE) {
    throw new PaginationError(`page_size is capped at ${MAX_PAGE_SIZE}.`);
  }
  return n;
}

export function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

export function decodeCursor(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function listResponse(rows, keyName, pageSize) {
  // rows must already be ordered by the stable key; fetch pageSize + 1 rows.
  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page.length ? page[page.length - 1][keyName] : null;
  return {
    data: page,
    next_cursor: hasMore ? encodeCursor({ [keyName]: last }) : null,
    has_more: hasMore,
  };
}
