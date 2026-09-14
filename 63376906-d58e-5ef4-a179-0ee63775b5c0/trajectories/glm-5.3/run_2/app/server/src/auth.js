import { q, one, withTx } from "./db.js";
import { cfg, roleScopes, grantEndsOn, may } from "./config.js";
import { record } from "./record.js";
import { nowIso } from "./arithmetic.js";

// Sign-in exchanges the email and password at keycloak. The app never accepts
// an identity a caller asserts; the bearer token it hands out is its own
// session, issued for twelve hours.
export async function loginToKeycloak(email, password) {
  const issuer = cfg.authIssuerUrl;
  if (!issuer) throw new Error("AUTH_ISSUER_URL is not configured");
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: cfg.authClientId,
    username: email,
    password,
  });
  if (cfg.authClientSecret) body.set("client_secret", cfg.authClientSecret);
  const res = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const tok = await res.json();
  const claims = decodeJwt(tok.access_token);
  const roles = (claims.realm_access?.roles || []).filter((r) =>
    [
      "plant_operator",
      "lab_analyst",
      "quality_manager",
      "claims_manager",
      "certificate_signer",
      "auditor",
    ].includes(r)
  );
  return { email: claims.email || email, roles, name: claims.name };
}

export function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

export async function issueSession(user) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const sites = roleScopes[user.email] || [];
  const expires = new Date(Date.now() + cfg.sessionTtlSeconds * 1000);
  await q(
    `insert into sessions(token, email, roles, sites, name, issued_at, expires_at) values($1,$2,$3,$4,$5,now(),$6)`,
    [token, user.email, JSON.stringify(user.roles), JSON.stringify(sites), user.name || null, expires]
  );
  return { access_token: token, token_type: "Bearer", expires_at: expires.toISOString() };
}

export async function bearerSession(bearer) {
  if (!bearer) return null;
  const row = await one(`select * from sessions where token = $1`, [bearer]);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return {
    email: row.email,
    roles: row.roles,
    sites: row.sites,
    name: row.name,
    expires_at: row.expires_at,
  };
}

export function identity(c) {
  const h = c.req.header("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? bearerSession(m[1]) : Promise.resolve(null);
}

export function requireAuth(handler) {
  return async (c) => {
    const sess = await identity(c);
    if (!sess) return c.json({ error: "unauthorized" }, 401);
    c.set("session", sess);
    return handler(c, sess);
  };
}

export function requireRole(action, handler) {
  return requireAuth(async (c, sess) => {
    if (!may(sess.roles, action)) {
      return c.json({ error: "forbidden", action }, 403);
    }
    return handler(c, sess);
  });
}

export function refusePagination(c) {
  for (const p of ["page", "limit", "offset", "cursor"]) {
    if (c.req.query(p) !== undefined) {
      return c.json(
        { error: "pagination_refused", parameter: p },
        400
      );
    }
  }
  return null;
}
