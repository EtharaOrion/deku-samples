import type { APIContext } from 'astro';
import { pool, q } from './db/pool.ts';
import { customerForToken, bearerFrom } from './auth.ts';
import { cartView } from './cart.ts';
import { findOrCreateCart } from './cart.ts';

export async function getCustomer(context: APIContext) {
  const bearer = context.request.headers.get('authorization');
  const cookie = context.cookies.get('vela_token')?.value ?? null;
  return customerForToken(bearer || cookie);
}

export async function getCartForContext(context: APIContext) {
  const token = context.cookies.get('vela_cart')?.value ?? null;
  if (!token) return null;
  const cart = await findOrCreateCart({ token });
  if (!cart) return null;
  return { row: cart, view: await cartView(cart) };
}

export async function ensureCartCookie(context: APIContext) {
  let token = context.cookies.get('vela_cart')?.value ?? null;
  if (!token) {
    const cart = await findOrCreateCart({ token: null });
    token = cart.token;
    context.cookies.set('vela_cart', token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  }
  return token;
}

export { pool, q };
