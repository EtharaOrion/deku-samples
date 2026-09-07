import { currentCustomer } from './api.js';

/**
 * A signed-out request for an /account route lands on /sign-in carrying the
 * intended path. An expired token refuses the action, changes nothing and
 * returns to /sign-in.
 */
export async function requireCustomerPage(Astro) {
  const customer = await currentCustomer(Astro.request);
  if (customer) return { customer, redirect: null };
  const next = Astro.url.pathname + (Astro.url.search || '');
  return {
    customer: null,
    redirect: Astro.redirect(`/sign-in?next=${encodeURIComponent(next)}`, 302),
  };
}
