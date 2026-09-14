// Server-side guard for /account routes. A signed-out request lands on
// /sign-in carrying the intended path; an expired token refuses the action
// and changes nothing.
export async function guard(request) {
  const url = new URL(request.url);
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : url.searchParams.get('session') || readSessionCookie(request);
  const { customerForToken } = await import('./auth.js');
  const out = bearer ? await customerForToken(bearer) : { expired: false, customer: null };
  return { bearer, customer: out.customer, expired: out.expired, next: url.pathname + url.search };
}

export function readSessionCookie(request) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)vela_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
