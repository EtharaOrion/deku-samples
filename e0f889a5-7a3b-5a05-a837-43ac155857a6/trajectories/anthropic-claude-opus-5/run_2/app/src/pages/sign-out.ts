import type { APIRoute } from 'astro';
import { originFrom, sessionTokenFrom } from '../lib/api';

/** Signing out returns to `/`. */
export const POST: APIRoute = async ({ request }) => {
  const token = sessionTokenFrom(request);
  if (token) {
    await fetch(`${originFrom(request)}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: '/',
      'set-cookie': 'vela_session=; path=/; max-age=0; samesite=lax',
    },
  });
};

export const GET: APIRoute = () => new Response(null, { status: 302, headers: { location: '/' } });
