import { q, one } from "./db.js";
import { sha256Hex } from "./arithmetic.js";

// An Idempotency-Key is scoped to the route it was sent to and to the body it
// was sent with. A write that arrives with no key at all is refused.
export function idempotency() {
  return async (c, next) => {
    const path = c.req.path;
    // Sign-in takes credentials rather than creating a record, and a public
    // enquiry is the one route outside the console; both carry keys anyway
    // except sign-in, which a caller retries with fresh credentials.
    if (path === "/api/auth/login") {
      return next();
    }
    if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") {
      return next();
    }
    const key = c.req.header("idempotency-key");
    if (!key) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }
    const raw = await c.req.raw.clone().text();
    const bodyHash = await sha256Hex(new TextEncoder().encode(raw));
    const route = c.req.path;
    const prior = await one(
      `select * from idempotency where key = $1 and route = $2`,
      [key, route]
    );
    if (prior) {
      if (prior.body_hash !== bodyHash) {
        return c.json(
          { error: "idempotency_key_reuse", route, key },
          409
        );
      }
      return c.newResponse(
        JSON.stringify(prior.response ?? {}),
        prior.status || 201,
        { "content-type": "application/json", "idempotent-replay": "true" }
      );
    }
    c.set("idem", { key, route, bodyHash });
    await next();
  };
}

export async function storeIdempotent(c, status, payload) {
  const idem = c.get("idem");
  if (!idem) return;
  await q(
    `insert into idempotency(key, route, body_hash, status, response) values($1,$2,$3,$4,$5)
     on conflict (key, route) do nothing`,
    [idem.key, idem.route, idem.bodyHash, status, JSON.stringify(payload)]
  );
}
