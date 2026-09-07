/**
 * Same-origin enforcement for form submissions.
 *
 * Astro's own check compares the Origin against the address the server binds,
 * which is wrong here: the app is reached through a mapped port and a public
 * hostname, so the Origin a browser sends never matches. This compares the
 * Origin against the Host of the very request instead, which is the comparison
 * that actually means "this form came from this site".
 */
export async function onRequest(context, next) {
  const { request } = context;

  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE' || request.method === 'PATCH') {
    const contentType = (request.headers.get('content-type') || '').split(';')[0].trim();
    const isForm =
      contentType === 'application/x-www-form-urlencoded' ||
      contentType === 'multipart/form-data' ||
      contentType === 'text/plain';

    if (isForm) {
      const origin = request.headers.get('origin');
      const host = request.headers.get('host');

      // A browser always sends Origin on a cross-site form post. Where it is
      // present it must name this same host.
      if (origin) {
        let originHost = null;
        try { originHost = new URL(origin).host; } catch { originHost = null; }
        if (!originHost || !host || originHost !== host) {
          return new Response('That did not work.', {
            status: 403,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
        }
      }
    }
  }

  return next();
}
