import { sameOrigin } from './lib/actions.js';

export async function onRequest(context, next) {
  if (context.request.method === 'POST') {
    const host = context.request.headers.get('host') || context.url.host;
    if (!sameOrigin(context.request, { host })) {
      return new Response('That did not work.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Origin-Seen': String(context.request.headers.get('origin')) },
      });
    }
  }
  return next();
}
