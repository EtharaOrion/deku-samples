import { one, q } from '../../server/db/index.js';
import { sha256 } from '../../server/util.js';
import { cartState } from '../../server/api/cart_core.js';

export async function currentCustomer(request) {
  const h = request.headers.get('authorization') || '';
  let token = null;
  if (h.toLowerCase().startsWith('bearer ')) token = h.slice(7).trim();
  if (!token) {
    const cookie = request.headers.get('cookie') || '';
    const m = cookie.match(/vela_token=([^;]+)/);
    if (m) token = decodeURIComponent(m[1]);
  }
  if (!token) return null;
  return await one(
    `SELECT c.id, c.email, c.name FROM auth_token t JOIN customer c ON c.id = t.customer_id
     WHERE t.token_hash = $1 AND t.expires_at > now()`,
    [sha256(token)]
  );
}

export async function currentCart(request) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/vela_cart=([^;]+)/);
  const token = m ? decodeURIComponent(m[1]) : null;
  if (!token) return { cart: null, state: null };
  const cart = await one('SELECT * FROM cart WHERE token = $1 AND expires_at > now()', [token]);
  if (!cart) return { cart: null, state: null };
  return { cart, state: await cartState(cart.id) };
}

export function cartCount(state) {
  if (!state) return 0;
  return state.lines.reduce((n, l) => n + l.quantity, 0);
}

export function money(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
