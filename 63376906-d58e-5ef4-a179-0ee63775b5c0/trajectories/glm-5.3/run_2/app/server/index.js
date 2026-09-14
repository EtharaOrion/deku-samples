import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, q, one } from "./src/db.js";
import { DDL, SCHEMA_VERSION } from "./src/schema.js";
import { seedIfEmpty, seedOperational } from "./src/seed.js";
import { api } from "./src/routes.js";
import { api2 } from "./src/routes2.js";
import { idempotency } from "./src/idempotency.js";
import { cfg } from "./src/config.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = join(here, "..", "client", "dist");

const app = new Hono();
app.use("/api/*", idempotency());
app.route("/api", api);
app.route("/api", api2);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  let p = url.pathname;
  if (p === "/") p = "/index.html";
  const file = join(dist, p);
  if (file.startsWith(dist) && existsSync(file) && statSync(file).isFile()) {
    const body = readFileSync(file);
    const headers = {
      "content-type": mime[extname(file)] || "application/octet-stream",
      "cache-control": extname(file) === ".html" ? "no-cache" : "public, max-age=3600",
    };
    return c.newResponse(body, 200, headers);
  }
  await next();
});

// The client owns the routes; the server hands it the shell for anything that
// is not a file and not an API route.
app.get("*", (c) => {
  const shell = join(dist, "index.html");
  if (!existsSync(shell)) {
    return c.text("Client build missing. Run npm run build.", 503);
  }
  return c.newResponse(readFileSync(shell), 200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-cache",
  });
});

async function start() {
  await pool.query(DDL);
  await pool.query(
    `create table if not exists schema_migrations(version text primary key, applied_at timestamptz default now())`
  );
  await pool.query(
    `insert into schema_migrations(version) values($1) on conflict do nothing`,
    [SCHEMA_VERSION]
  );
  const seeded1 = await seedIfEmpty().catch((e) => {
    console.error("seed reference data failed", e);
    return false;
  });
  const seeded2 = await seedOperational().catch((e) => {
    console.error("seed operational data failed", e);
    return false;
  });
  console.log(`migrations applied (schema ${SCHEMA_VERSION}), seeded: ${seeded1} ${seeded2}`);
  const port = Number(process.env.PORT || 4173);
  const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
    console.log(`Ravel listening on http://0.0.0.0:${info.port}`);
  });
  // A closed run queued while the arithmetic was unavailable is reported as
  // queued rather than as complete; nothing is silently dropped.
  setInterval(async () => {
    try {
      const queued = await q(`select reference from runs where queued_close = true and closed_at is null`);
      for (const r of queued) {
        await q(`update runs set queued_close = false where reference = $1`, [r.reference]);
      }
    } catch {}
  }, 60000).unref?.();
}

start().catch((e) => {
  console.error("startup failed", e);
  process.exit(1);
});
