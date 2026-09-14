import api from '../../hono-api.js';

export const prerender = false;

export const GET = (ctx) => api.fetch(ctx.request);
export const POST = (ctx) => api.fetch(ctx.request);
export const PUT = (ctx) => api.fetch(ctx.request);
export const PATCH = (ctx) => api.fetch(ctx.request);
export const DELETE = (ctx) => api.fetch(ctx.request);
