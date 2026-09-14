import { errors } from './errors.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Keyset cursor helpers. A cursor is the stable ordering key of the last row
 * of the current page, base64 encoded, so a caller can ask for the next page
 * without ever knowing the key's shape. Rows arriving between two reads are
 * never repeated and never skipped.
 */
export function encodeCursor(key) {
  return Buffer.from(String(key), 'utf8').toString('base64url');
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const s = Buffer.from(String(cursor), 'base64url').toString('utf8');
    return s === '' ? null : s;
  } catch {
    throw errors.validation('That cursor is not valid.');
  }
}

/**
 * Validate page_size from a query object. Accepts page_size and limit.
 * A request naming more than the cap is refused with the cap named.
 */
export function parsePagination(query) {
  const raw = query.page_size !== undefined ? query.page_size : query.limit;
  if (raw === undefined || raw === null || raw === '') {
    return { page_size: DEFAULT_PAGE_SIZE };
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw errors.validation('page_size must be a whole number of 1 or more.');
  }
  if (n > MAX_PAGE_SIZE) {
    throw errors.pageSizeCap(MAX_PAGE_SIZE);
  }
  return { page_size: n };
}

/**
 * Read one page of rows with a keyset cursor on a monotonically decreasing
 * ordering key (newest first). keyExpr is a SQL expression, params are
 * positional starting at startIdx.
 */
export async function readPage(client, { sql, params = [], keyExpr, cursor, page_size, startIdx = 1 }) {
  const key = decodeCursor(cursor);
  const values = [...params];
  let where = '';
  if (key !== null) {
    values.push(key);
    where = ` AND ${keyExpr} < $${values.length}::text`;
  }
  const finalSql = sql.replace('__CURSOR__', where);
  values.push(page_size + 1);
  const limitIdx = values.length;
  const res = await client.query(
    `SELECT * FROM (${finalSql}) AS page_rows LIMIT ${page_size + 1}`,
    values
  );
  void limitIdx;
  const rows = res.rows;
  const hasMore = rows.length > page_size;
  const page = hasMore ? rows.slice(0, page_size) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.__key) : null;
  return { rows: page, has_more: hasMore, next_cursor: nextCursor };
}
