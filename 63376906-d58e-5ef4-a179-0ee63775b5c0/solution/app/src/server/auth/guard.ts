import type { Context } from 'hono';
import { readSessionToken, type Session } from './session.js';
import type { Role } from '../../shared/enums.js';

export type AppEnv = { Variables: { session: Session } };

export class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly rule: string,
    readonly detail: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(detail);
  }
  body(): Record<string, unknown> {
    return { error: this.rule, detail: this.detail, ...this.extra };
  }
}

export function sessionFrom(c: Context): Session | null {
  const header = c.req.header('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return readSessionToken(header.slice(7).trim());
}

/** Authorisation runs before validation: a caller outside the role list is refused with 403. */
export function requireRole(session: Session, roles: readonly Role[], act: string): void {
  if (!roles.includes(session.role)) {
    throw new Refusal(403, 'role_not_granted', `${session.role} may not ${act}`, { roles_permitted: [...roles] });
  }
}

export function requireSiteScope(session: Session, site: string, act: string): void {
  if (!session.sites.includes(site)) {
    throw new Refusal(403, 'site_scope_missing', `${session.email} holds no scope for ${site} and may not ${act}`, {
      site,
      sites_held: session.sites,
    });
  }
}
