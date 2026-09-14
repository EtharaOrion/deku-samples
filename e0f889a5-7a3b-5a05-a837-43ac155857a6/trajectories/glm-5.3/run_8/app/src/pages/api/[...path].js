import { api } from '@server/api/index.js';
import { ApiError, newRequestId } from '@server/api/helpers.js';

export const prerender = false;

export async function ALL({ request, params, url }) {
  const requestId = newRequestId();
  const started = Date.now();
  let status = 500;
  try {
    // Hono mounts at /api; rebuild the path Hono expects.
    const sub = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
    const path = '/api/' + sub + (url.search || '');
    const res = await api.fetch(new Request(new URL(path, url.origin), request), { requestId });
    status = res.status;
    return res;
  } catch (err) {
    const e = err instanceof ApiError ? err : null;
    status = e ? e.status : 500;
    if (!e) console.error(JSON.stringify({ event: 'api_error', request_id: requestId, error: String(err && err.stack || err) }));
    return new Response(
      JSON.stringify({
        error: {
          code: e ? e.code : 'internal_error',
          message: e ? e.message : `Something went wrong at our end. Reference ${requestId}.`,
          request_id: requestId,
        },
      }),
      { status, headers: { 'content-type': 'application/json' } }
    );
  } finally {
    console.log(JSON.stringify({
      event: 'http_request',
      request_id: requestId,
      method: request.method,
      route: url.pathname,
      status,
      elapsed_ms: Date.now() - started,
    }));
  }
}

export const GET = ALL;
export const POST = ALL;
export const PUT = ALL;
export const PATCH = ALL;
export const DELETE = ALL;
