import crypto from "node:crypto";
import { one, q } from "./db.mjs";

const ISSUER = process.env.AUTH_ISSUER_URL;
const CLIENT_ID = process.env.AUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET;

const SESSION_MS = 12 * 60 * 60 * 1000;

export async function keycloakToken(email, password) {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: email,
    password,
  });
  const res = await fetch(ISSUER + "/protocol/openid-connect/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  return res.json();
}

export function newSessionId() {
  return crypto.randomBytes(24).toString("hex");
}

export async function createSession(email, roles, sites, kcToken) {
  const id = newSessionId();
  const at = new Date();
  const until = new Date(at.getTime() + SESSION_MS);
  await q(
    `INSERT INTO app_session (id, email, roles, sites, issued_at, expires_at, access_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, email, JSON.stringify(roles), JSON.stringify(sites), at.toISOString(), until.toISOString(), kcToken]
  );
  return { id, email, roles, sites, expires_at: until.toISOString() };
}

export async function sessionFromRequest(req) {
  const h = req.header("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const s = await one("SELECT * FROM app_session WHERE id=$1", [m[1].trim()]);
  if (!s) return null;
  if (new Date(s.expires_at).getTime() < Date.now()) {
    await q("DELETE FROM app_session WHERE id=$1", [s.id]);
    return null;
  }
  const parse = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
    return [];
  };
  return {
    id: s.id,
    email: s.email,
    roles: parse(s.roles),
    sites: parse(s.sites),
  };
}

export function unauthorized(c) {
  return c.json({ error: "unauthorized" }, 401);
}
export function forbidden(c, why) {
  return c.json({ error: "forbidden", reason: why || "role_not_permitted" }, 403);
}
