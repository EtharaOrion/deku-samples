import type { APIContext } from 'astro';
import { customerForToken, bearerFrom } from './auth.ts';

export async function requirePageCustomer(context: APIContext): Promise<any | null> {
  const cookieToken = context.cookies.get('vela_token')?.value ?? null;
  const header = context.request.headers.get('authorization');
  const bearer = bearerFrom(header);
  return customerForToken(cookieToken || bearer);
}

/** A signed-out request for an /account route lands on /sign-in carrying the intended path. */
export function signInRedirect(path: string): string {
  return `/sign-in?redirect=${encodeURIComponent(path)}`;
}
