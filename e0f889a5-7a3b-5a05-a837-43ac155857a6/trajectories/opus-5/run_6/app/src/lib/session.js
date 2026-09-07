import { customerForToken } from '../../server/services/auth.js';
import { cartByToken, readCart } from '../../server/services/cart.js';

export const AUTH_COOKIE = 'vela_token';
export const CART_COOKIE = 'vela_cart';

export async function currentCustomer(Astro) {
  const token = Astro.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    return await customerForToken(token);
  } catch {
    return null;
  }
}

export async function currentCartView(Astro) {
  const token = Astro.cookies.get(CART_COOKIE)?.value;
  if (!token) return null;
  const cart = await cartByToken(token);
  if (!cart) return null;
  return { cart, view: await readCart(cart) };
}

export async function cartCount(Astro) {
  const found = await currentCartView(Astro);
  return found ? found.view.item_count : 0;
}
