import type { APIRoute } from 'astro';
import { q } from '../server/db/pool.ts';
import { sha256Hex } from '../server/crypto.ts';

export const POST: APIRoute = async ({ cookies, request, redirect }) => {
  const token = cookies.get('vela_token')?.value;
  const header = request.headers.get('authorization');
  const bearer = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  for (const t of [token, bearer]) {
    if (t) await q('DELETE FROM auth_token WHERE token_hash = $1', [sha256Hex(t)]).catch(() => {});
  }
  cookies.delete('vela_token', { path: '/' });
  // Signing out returns to the letter.
  return redirect('/', 303);
};
