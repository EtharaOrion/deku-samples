import { defineMiddleware } from 'astro:middleware';
import { randomUUID } from 'node:crypto';
import { handleApiRequest } from './server/api/index.ts';
import { waitForDatabase, migrateAndSeed } from './server/seed.ts';
import { setMissingSchemaHandler } from './server/db/pool.ts';

let readyPromise: Promise<void> | null = null;

export function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      await waitForDatabase(60, 1000);
      await migrateAndSeed();
    })();
    readyPromise.catch(() => { readyPromise = null; });
  }
  return readyPromise;
}

setMissingSchemaHandler(() => { readyPromise = null; });

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const requestId = randomUUID();
  const start = Date.now();

  (context.locals as any).requestId = requestId;
  (context.locals as any).cartToken = context.cookies.get('vela_cart')?.value ?? null;
  (context.locals as any).bearer = request.headers.get('authorization');

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    if (url.pathname !== '/api/health') {
      try {
        await ensureReady();
      } catch (err) {
        console.error(JSON.stringify({ level: 'error', msg: 'startup_failed', error: String(err), time: new Date().toISOString() }));
        const response = new Response(JSON.stringify({ error: { code: 'not_ready', message: 'Something went wrong at our end.', request_id: requestId } }), { status: 503, headers: { 'content-type': 'application/json' } });
        logRequest(request.method, url.pathname, response.status, Date.now() - start, requestId);
        return response;
      }
    } else {
      ensureReady().catch(() => {});
    }
    let response = await handleApiRequest(request, requestId);
    // A missing schema self-heals: apply it, seed it, then serve the request once.
    if (response.status >= 500) {
      const clone = response.clone();
      const body = await clone.json().catch(() => null);
      const code = body?.error?.code;
      if (code === '42P01' || code === '3F000') {
        try {
          readyPromise = null;
          await ensureReady();
          response = await handleApiRequest(request, requestId);
        } catch {
          /* the original response stands */
        }
      }
    }
    logRequest(request.method, url.pathname, response.status, Date.now() - start, requestId);
    return response;
  }

  try { await ensureReady(); } catch { /* pages handle their own error state */ }

  const response = await next();
  logRequest(request.method, url.pathname, response.status, Date.now() - start, requestId);
  return response;
});

export function logRequest(method: string, path: string, status: number, elapsedMs: number, requestId: string) {
  process.stdout.write(JSON.stringify({
    level: status >= 500 ? 'error' : 'info',
    msg: 'request',
    method,
    route: path,
    status,
    elapsed_ms: elapsedMs,
    request_id: requestId,
    time: new Date().toISOString(),
  }) + '\n');
}
