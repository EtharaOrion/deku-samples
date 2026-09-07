// Astro pages render on the server against the same service layer the API uses,
// so first paint is complete markup rather than a shell waiting on fetch.
export { listProducts, getProductByHandle, shippingMethods } from '../../server/lib/catalogue.mjs';
export { findCartByToken, readCart } from '../../server/lib/cart.mjs';
export { readOrderFor, publicOrder, statePhrase, getOrderByNumber } from '../../server/lib/orders.mjs';
export { listReleases, getRelease, newestRelease, NOTE_GROUPS } from '../../server/lib/releases.mjs';
export { manifestFor, newestFirmware } from '../../server/lib/firmware.mjs';
export { listDevicesForCustomer, getOwnedDevice } from '../../server/lib/devices.mjs';
export { customerForToken, publicCustomer } from '../../server/lib/auth.mjs';
export { query } from '../../server/lib/db.mjs';

import { customerForToken } from '../../server/lib/auth.mjs';
import { findCartByToken, readCart } from '../../server/lib/cart.mjs';

export const CART_COOKIE = 'vela_cart';
export const SESSION_COOKIE = 'vela_session';

/** The signed-in customer for this request, or null. */
export async function currentCustomer(Astro) {
  const token = Astro.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await customerForToken(token);
  if (!row) return null;
  return { id: String(row.id), email: row.email, name: row.name };
}

/** The cart for this request as a view, without creating one to read it. */
export async function currentCart(Astro) {
  const token = Astro.cookies.get(CART_COOKIE)?.value;
  if (!token) return null;
  const cart = await findCartByToken(token);
  if (!cart) return null;
  return readCart(cart);
}

/**
 * A signed-out request for an /account route lands on /sign-in carrying the
 * intended path and returns there after signing in.
 */
export function signInRedirect(Astro) {
  const next = Astro.url.pathname + (Astro.url.search || '');
  return Astro.redirect(`/sign-in?next=${encodeURIComponent(next)}`);
}
