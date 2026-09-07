import type { APIRoute } from 'astro';
import { apiFetch } from '../lib/api.js';

// Signing out returns to /.
export const POST: APIRoute = async (context) => {
  await apiFetch(context as any, '/api/auth/logout', { method: 'POST' });
  return context.redirect('/', 303);
};

export const GET: APIRoute = async (context) => context.redirect('/', 303);
