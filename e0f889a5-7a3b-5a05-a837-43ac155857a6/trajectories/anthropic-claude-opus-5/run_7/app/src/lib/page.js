import { apiGet, readSession, readCartToken } from './api.js';

/**
 * Resolve the viewer for a server-rendered page: the signed-in customer if the
 * token is good, and the cart count for the header control.
 */
export async function viewer(Astro) {
  const token = readSession(Astro);
  const cartToken = readCartToken(Astro);

  let customer = null;
  if (token) {
    const me = await apiGet(Astro.request, '/auth/me', { token });
    if (me.ok) customer = me.data.customer;
  }

  let cartCount = 0;
  if (cartToken) {
    const cart = await apiGet(Astro.request, '/cart', { cartToken });
    if (cart.ok) cartCount = cart.data.cart.item_count || 0;
  }

  return { token, cartToken, customer, signedIn: Boolean(customer), cartCount };
}

/**
 * A signed-out request for an /account route lands on /sign-in carrying the
 * intended path, and returns there after signing in.
 */
export function signInRedirect(Astro) {
  const next = Astro.url.pathname + (Astro.url.search || '');
  return Astro.redirect(`/sign-in?next=${encodeURIComponent(next)}`, 302);
}
