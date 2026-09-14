import { q, one, tx } from "./db.mjs";
import { record, recordAct, sha256 } from "./core.mjs";
import { dryMass, creditGranted, contentBp, factorBpFromWindow, byproductShareBp } from "./core.mjs";
import * as engine from "./engine.mjs";
import { genealogyForLot, impactOfBatch, batchClaimability, batchFlags, loadGraph, ancestorsOfLot } from "./genealogy.mjs";
import { sendMail } from "./mail.mjs";
import { sessionFromRequest, keycloakToken, createSession } from "./auth.mjs";

export function guard(handler) {
  return async (c) => {
    const session = await sessionFromRequest(c.req);
    if (!session) return c.json({ error: "unauthorized" }, 401);
    c.set("session", session);
    return handler(c);
  };
}

/* role() is middleware: it decides before the handler runs and calls next() when
   the caller may proceed, so a denied request leaves the protected state unchanged. */
export function role(...roles) {
  return async (c, next) => {
    const session = await sessionFromRequest(c.req);
    if (!session) return c.json({ error: "unauthorized" }, 401);
    c.set("session", session);
    const ok = roles.length === 0 || session.roles.some((r) => roles.includes(r));
    if (!ok) {
      await recordAct({
        act: "refused", person: session.email, site: null, object: c.req.path,
        detail: { reason: "role_not_permitted", roles: session.roles },
        refused: "role_not_permitted",
      }).catch(() => {});
      return c.json({ error: "forbidden", reason: "role_not_permitted" }, 403);
    }
    await next();
  };
}

export function readOnly(...roles) {
  const list = ["auditor", "quality_manager", "claims_manager", "plant_operator", "lab_analyst", "certificate_signer"];
  return role(...(roles.length ? roles : list));
}

export async function requireIdempotency(c) {
  const key = c.req.header("Idempotency-Key");
  if (!key) return { error: c.json({ error: "idempotency_key_required" }, 400) };
  return { key };
}

export function num(v, name) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw Object.assign(new Error(name + " must be a non-negative integer"), { status: 422, field: name });
  return n;
}

export function refusePagination(c) {
  for (const p of ["page", "limit", "offset", "cursor"]) {
    if (c.req.query(p) !== undefined) {
      return c.json({ error: "pagination_refused", parameter: p }, 400);
    }
  }
  return null;
}

export async function withIdempotency(c, routeKey, body, fn) {
  const key = c.req.header("Idempotency-Key");
  if (!key) return c.json({ error: "idempotency_key_required" }, 400);
  return tx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["idem:" + routeKey + ":" + key]);
    const existing = await client.query("SELECT * FROM idempotency_key WHERE key=$1 AND route=$2", [key, routeKey]);
    const bodyJson = JSON.stringify(body ?? null);
    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.body !== bodyJson) {
        return { status: 409, body: { error: "idempotency_key_reuse", route: routeKey } };
      }
      const stored = row.response ? JSON.parse(row.response) : null;
      return { status: stored ? stored.__status || 201 : 201, body: stored ? stripStatus(stored) : { note: "already recorded" } };
    }
    await client.query("INSERT INTO idempotency_key (key, route, body, at) VALUES ($1,$2,$3,now())", [key, routeKey, bodyJson]);
    const out = await fn(client);
    if (out && typeof out === "object") {
      await client.query("UPDATE idempotency_key SET response=$3 WHERE key=$1 AND route=$2", [key, routeKey, JSON.stringify(Object.assign({ __status: out.status || 201 }, out.body))]);
    }
    return out;
  }).then((out) => {
    if (!out || typeof out !== "object") return c.json({ error: "internal" }, 500);
    if (out.body && out.body.error === "idempotency_key_reuse") return c.json(out.body, 409);
    const status = Number(out.status) || 201;
    return c.json(out.body === undefined ? { ok: true } : out.body, status);
  }).catch((e) => {
    if (e.status) return c.json({ error: e.code || "invalid", message: e.message, field: e.field }, e.status);
    console.error("route error", e && e.stack || e);
    return c.json({ error: "internal", message: e.message }, 500);
  });
}

function stripStatus(o) { const c = Object.assign({}, o); delete c.__status; return c; }

export function nextRef(prefix) {
  return prefix + "-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}
