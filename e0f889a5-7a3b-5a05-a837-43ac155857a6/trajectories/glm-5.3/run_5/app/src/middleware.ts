import { defineMiddleware } from 'astro:middleware';
import { handleApi } from './server/api.js';

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const path = url.pathname.slice('/api'.length) || '/';
    const apiRequest = new Request(new URL(path + url.search, url.origin), request);
    return handleApi(apiRequest);
  }
  const response = await next();
  response.headers.set('x-request-id', context.locals.requestId ?? '');
  return response;
});
