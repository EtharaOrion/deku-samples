import { apiGet, authHeaders } from './api';

export interface Viewer {
  customer: { id: string; email: string; name: string } | null;
  cartCount: number;
}

/**
 * Resolved on the server for every shell route, so the rail and the cart control
 * are correct in the first paint rather than after a client fetch.
 */
export async function viewerFor(request: Request): Promise<Viewer> {
  const [me, cart] = await Promise.all([
    apiGet<{ customer: any }>(request, '/auth/me', { headers: authHeaders(request) }),
    apiGet<{ item_count: number }>(request, '/cart'),
  ]);
  return {
    customer: me.ok ? me.data.customer : null,
    cartCount: cart.ok ? Number(cart.data.item_count || 0) : 0,
  };
}

/**
 * A signed-out request for an /account route lands on /sign-in carrying the
 * intended path, and returns there after signing in.
 */
export function signInRedirect(pathname: string): Response {
  const next = encodeURIComponent(pathname);
  return new Response(null, { status: 302, headers: { location: `/sign-in?next=${next}` } });
}
