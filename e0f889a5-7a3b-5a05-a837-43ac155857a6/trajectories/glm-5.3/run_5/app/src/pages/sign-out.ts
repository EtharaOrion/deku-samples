import type { APIRoute } from 'astro';

/** Signing out returns to the letter. */
export const POST: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete('vela_token', { path: '/' });
  return redirect('/', 303);
};

export const GET: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete('vela_token', { path: '/' });
  return redirect('/', 303);
};
