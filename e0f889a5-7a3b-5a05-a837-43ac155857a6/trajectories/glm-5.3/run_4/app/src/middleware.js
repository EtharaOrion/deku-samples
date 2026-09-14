import { sha256 } from './lib/ids.js';
import { query, one } from './lib/db.js';

/** Runs on every request: resolves the customer and the cart count. */
export async function onRequest(context, next) {
  const { cookies, locals, request, url } = context;
  locals.customer = null;
  locals.cartCount = 0;

  // Bearer token from the cookie mirror, or the Authorization header.
  let token = cookies.get('vela_token')?.value || null;
  const authHeader = request.headers.get('authorization') || '';
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (m) token = m[1];

  if (token) {
    try {
      const row = await one(
        `SELECT c.* FROM auth_token t JOIN customer c ON c.id = t.customer_id
         WHERE t.token_hash = $1 AND t.expires_at > now()`,
        [sha256(token)]
      );
      if (row) locals.customer = row;
      else locals.expiredToken = true;
    } catch { /* database not ready */ }
  }

  const cartToken = cookies.get('vela_cart')?.value;
  if (cartToken) {
    try {
      const r = await query(
        `SELECT COALESCE(SUM(quantity), 0) AS n FROM cart_line cl JOIN cart c ON c.id = cl.cart_id WHERE c.token = $1`,
        [cartToken]
      );
      locals.cartCount = Number(r.rows[0]?.n || 0);
    } catch { /* ignore */ }
  }

  // An expired token refuses the action and returns to sign-in.
  if (locals.expiredToken && url.pathname.startsWith('/account')) {
    return Response.redirect(new URL(`/sign-in?next=${encodeURIComponent(url.pathname)}`, url.origin), 302);
  }

  return next();
}
