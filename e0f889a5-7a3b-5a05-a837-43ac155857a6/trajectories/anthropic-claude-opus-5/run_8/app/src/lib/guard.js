import { apiFetch } from './api.js';

// A signed-out request for an /account route lands on /sign-in carrying the
// intended path and returns there after signing in. An expired token refuses
// the action, changes nothing and returns to /sign-in.
export async function requireCustomer(Astro) {
  const res = await apiFetch(Astro, '/api/auth/me');
  if (res.status === 200) return { customer: res.data.customer, redirect: null };
  const next = Astro.url.pathname + (Astro.url.search || '');
  return {
    customer: null,
    redirect: Astro.redirect(`/sign-in?next=${encodeURIComponent(next)}`, 303),
  };
}
