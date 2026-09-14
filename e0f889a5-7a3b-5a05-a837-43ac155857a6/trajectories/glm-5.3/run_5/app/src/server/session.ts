import type { AstroCookies } from 'astro';
import { readToken } from './auth.js';
import { one } from './db.js';
import { ensureCart, getCartState } from './cart.js';

export const AUTH_COOKIE = 'vela_token';
export const CART_COOKIE_NAME = 'vela_cart';

export type SessionCustomer = { id: number; email: string; name: string } | null;

export async function sessionCustomer(request: Request, cookies: AstroCookies): Promise<SessionCustomer> {
  const header = request.headers.get('authorization');
  let token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    const cookie = request.headers.get('cookie') ?? '';
    const m = /(?:^|;\s*)vela_token=([^;]+)/.exec(cookie);
    if (m) token = decodeURIComponent(m[1]);
  }
  const payload = readToken(token);
  if (!payload) return null;
  const row = await one<{ id: number; email: string; name: string }>(
    `SELECT id, email, name FROM customer WHERE id = $1 AND status = 'active'`, [payload.sub]);
  return row ?? null;
}

export async function sessionCart(cookies: AstroCookies, customer: SessionCustomer) {
  const existing = cookies.get(CART_COOKIE_NAME)?.value ?? null;
  const token = await ensureCart(existing ?? undefined, customer?.id ?? null);
  if (token !== existing) {
    cookies.set(CART_COOKIE_NAME, token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  }
  const state = await getCartState(token);
  const count = state ? state.lines.reduce((n, l) => n + l.quantity, 0) : 0;
  return { token, state, count };
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
