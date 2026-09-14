import { defineMiddleware } from 'astro:middleware';
import { boot } from './boot.js';
import { newRequestId, requestLog } from './lib/logs.js';

let counter = 0;

export const onRequest = defineMiddleware(async (ctx, next) => {
  const requestId = `req_${Date.now().toString(36)}_${(++counter).toString(36)}`;
  ctx.locals.requestId = requestId;
  const startedAt = Date.now();
  // Pages read the database directly, so nothing renders before the app is
  // booted and seeded.
  if (!ctx.url.pathname.startsWith('/api/')) {
    await boot();
  }
  const res = await next();
  res.headers.set('x-request-id', requestId);
  if (!ctx.url.pathname.startsWith('/api/')) {
    requestLog(requestId, ctx.request.method, ctx.url.pathname, res.status, startedAt);
  }
  return res;
});
