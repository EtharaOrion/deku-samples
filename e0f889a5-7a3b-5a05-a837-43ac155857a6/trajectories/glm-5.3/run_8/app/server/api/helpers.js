import { randomBytes } from 'node:crypto';
import { one } from '../db/index.js';
import { sha256 } from '../util.js';

export const newRequestId = () => randomBytes(8).toString('hex');

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function pageSizeParams(url) {
  let sp;
  try { sp = new URL(url, 'http://x').searchParams; } catch { sp = new URLSearchParams(''); }
  const raw = sp.get('page_size') ?? sp.get('limit');
  if (raw === null || raw === '') return { page_size: 20, explicit: false };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new ApiError(400, 'invalid_page_size', 'page_size must be a whole number of at least 1.');
  }
  if (n > 100) {
    throw new ApiError(400, 'page_size_too_large', `page_size is capped at 100. ${n} is above the cap.`);
  }
  return { page_size: n, explicit: true };
}

export function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export function decodeCursor(s) {
  if (!s) return null;
  try { return JSON.parse(Buffer.from(String(s), 'base64url').toString('utf8')); } catch { return null; }
}

// rows: already ordered by cursorKey desc; fetch pageSize+1 to detect more.
export function listEnvelope(rows, { pageSize, cursorKey, extra = {} }) {
  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  const next_cursor = hasMore && last ? encodeCursor({ [cursorKey]: last[cursorKey] }) : null;
  return { data: page, next_cursor, has_more: hasMore, ...extra };
}

export function cursorWhere(cursor, cursorKey, column) {
  const v = cursor ? cursor[cursorKey] : null;
  if (v === null || v === undefined) return { clause: 'TRUE', params: [] };
  return { clause: `${column} < $`, params: [v] };
}

export function bearerFrom(req) {
  const h = req.headers.get('authorization') || '';
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(/vela_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function customerFromRequest(req) {
  const token = bearerFrom(req);
  if (!token) return null;
  const row = await one(
    `SELECT c.id, c.email, c.name, c.status FROM auth_token t JOIN customer c ON c.id = t.customer_id
     WHERE t.token_hash = $1 AND t.expires_at > now()`,
    [sha256(token)]
  );
  return row || null;
}

export async function requireCustomer(req) {
  const cust = await customerFromRequest(req);
  if (!cust) throw new ApiError(401, 'unauthorized', 'Sign in to continue.');
  return cust;
}

export async function findCart(req) {
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(/vela_cart=([^;]+)/);
  const token = m ? decodeURIComponent(m[1]) : null;
  if (!token) return { cart: null, token: null };
  const cart = await one('SELECT * FROM cart WHERE token = $1 AND expires_at > now()', [token]);
  return { cart, token };
}

export async function createCart() {
  return await one('INSERT INTO cart (token) VALUES ($1) RETURNING *', [randomBytes(18).toString('base64url')]);
}

export async function cartFromContext(c) {
  const found = await findCart(c.req.raw);
  if (found.cart) return found;
  const fresh = await createCart();
  c.header('Set-Cookie', `vela_cart=${encodeURIComponent(fresh.token)}; Path=/; Max-Age=2592000; SameSite=Lax`, { append: true });
  return { cart: fresh, token: fresh.token };
}
