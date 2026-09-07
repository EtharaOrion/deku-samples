import { pageCustomer } from './server-fetch.js';

/**
 * A redirect that carries its cookies.
 *
 * Returning a Response from a page replaces the one the framework was
 * building, so headers staged on Astro.response are dropped. The session
 * cookie has to be set on the very response that redirects, or the reader
 * arrives at the next page signed out.
 */
export function redirectWithCookies(location, cookies = [], status = 303) {
  const headers = new Headers({ location });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status, headers });
}

export function sessionCookie(token, maxAge = 60 * 60 * 12) {
  return `vela_token=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly`;
}

/**
 * Redirect while keeping any cookie the render already staged, such as a cart
 * token minted during this request. Without this a redirect would hand the
 * reader a page that has forgotten their cart.
 */
export function redirectKeeping(Astro, location, status = 303) {
  const staged =
    typeof Astro.response.headers.getSetCookie === 'function'
      ? Astro.response.headers.getSetCookie()
      : [];
  return redirectWithCookies(location, staged, status);
}

/**
 * A signed-out request for an /account route lands on /sign-in carrying the
 * intended path and returns there after signing in. An expired token refuses
 * the action, changes nothing and returns to /sign-in.
 */
export async function requirePageCustomer(Astro) {
  const customer = await pageCustomer(Astro);
  if (customer) return { customer, redirect: null };
  const intended = Astro.url.pathname + (Astro.url.search || '');
  return {
    customer: null,
    redirect: redirectKeeping(Astro, `/sign-in?next=${encodeURIComponent(intended)}`),
  };
}
