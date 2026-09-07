import type { APIRoute } from 'astro';
import { api } from '../../api/app.js';

export const prerender = false;

// The HTTP API is served by Hono on the same origin under the /api prefix.
const handle: APIRoute = ({ request }) => api.fetch(request);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
export const ALL = handle;
