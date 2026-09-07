import { sessionFromRequest, grantFor } from '../lib/auth.js';
import { dayOf } from '../lib/num.js';
import { refuse, recordRefusal } from '../lib/http.js';

export async function attachSession(c, next) {
  const claims = await sessionFromRequest(c);
  c.set('session', claims);
  await next();
}

export function requireSession(c) {
  const s = c.get('session');
  if (!s) throw refuse(401, 'authentication_required', 'This route needs a session. Sign in at /api/auth/login.');
  return s;
}

// Authorization is decided on the server for every mutating route, and a denied
// request leaves the protected state unchanged.
export async function requireRole(c, act, ...roles) {
  const s = requireSession(c);
  if (!roles.some((r) => (s.roles || []).includes(r))) {
    await recordRefusal(s, act, 'authorization', c.req.path, {
      required_roles: roles,
      held_roles: s.roles,
      detail: 'The role held does not carry this act.',
    });
    throw refuse(403, 'role_not_permitted', `This act is carried by ${roles.join(' or ')}. The session holds ${(s.roles || []).join(', ') || 'no role'}.`, {
      required_roles: roles,
      held_roles: s.roles || [],
    });
  }
  // A grant is scoped to a site and carries an end date; nothing renews silently.
  const grant = await grantFor(s.email);
  const today = new Date().toISOString().slice(0, 10);
  if (grant && dayOf(grant.ends_on) < today) {
    throw refuse(403, 'grant_ended', `The grant for ${s.email} ended on ${dayOf(grant.ends_on)}. Nothing renews silently.`);
  }
  return s;
}

// An auditor writes no operational record, at any route.
export async function refuseAuditorWrites(c, next) {
  const s = c.get('session');
  const method = c.req.method;
  if (s && (s.roles || []).includes('auditor') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const allowed = [/^\/exports$/, /^\/annotations$/, /^\/record\/queries\//];
    const p = c.req.path.replace(/^\/api/, '');
    if (!allowed.some((re) => re.test(p))) {
      await recordRefusal(s, 'auditor_write_refused', 'authorization', c.req.path, { detail: 'An auditor writes no operational record, at any route.' });
      return c.json(
        { error: 'auditor_writes_nothing', detail: 'An auditor reads, exports and annotates. It writes no operational record, at any route.' },
        403,
      );
    }
  }
  return next();
}

export function siteInScope(session, site) {
  return !site || (session.sites || []).includes(site);
}

export async function requireSiteScope(c, session, site) {
  if (!siteInScope(session, site)) {
    await recordRefusal(session, 'site_scope_refused', 'authorization', site, { detail: 'The grant does not reach this site.' });
    throw refuse(403, 'site_out_of_scope', `${session.email} is scoped to ${(session.sites || []).join(', ') || 'no site'} and this act is at ${site}.`, {
      site,
      scoped_to: session.sites || [],
    });
  }
}
