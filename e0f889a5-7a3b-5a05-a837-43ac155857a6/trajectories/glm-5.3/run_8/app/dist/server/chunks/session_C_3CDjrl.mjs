import { one } from "./index_CC0DBeZe.mjs";
import { s as sha256 } from "./util_DjyUBxV_.mjs";
import { c as cartState } from "./cart_core_j-TwnKtO.mjs";
async function currentCustomer(request) {
  const h = request.headers.get("authorization") || "";
  let token = null;
  if (h.toLowerCase().startsWith("bearer ")) token = h.slice(7).trim();
  if (!token) {
    const cookie = request.headers.get("cookie") || "";
    const m = cookie.match(/vela_token=([^;]+)/);
    if (m) token = decodeURIComponent(m[1]);
  }
  if (!token) return null;
  return await one(`SELECT c.id, c.email, c.name FROM auth_token t JOIN customer c ON c.id = t.customer_id
     WHERE t.token_hash = $1 AND t.expires_at > now()`, [sha256(token)]);
}
async function currentCart(request) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/vela_cart=([^;]+)/);
  const token = m ? decodeURIComponent(m[1]) : null;
  if (!token) return {
    cart: null,
    state: null
  };
  const cart = await one("SELECT * FROM cart WHERE token = $1 AND expires_at > now()", [token]);
  if (!cart) return {
    cart: null,
    state: null
  };
  return {
    cart,
    state: await cartState(cart.id)
  };
}
function cartCount(state) {
  if (!state) return 0;
  return state.lines.reduce((n, l) => n + l.quantity, 0);
}
export {
  cartCount,
  currentCart,
  currentCustomer
};
