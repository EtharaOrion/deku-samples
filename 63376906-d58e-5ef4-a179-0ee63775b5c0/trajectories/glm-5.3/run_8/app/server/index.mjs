import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { q, one, db } from "./lib/db.mjs";
import { sha256 } from "./lib/core.mjs";
import { core } from "./routes-core.mjs";
import { ledger } from "./routes-ledger.mjs";
import { certs } from "./routes-cert.mjs";
import { records } from "./routes-record.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT || 4173);

const app = new Hono();
app.use("*", async (c, next) => {
  await next();
  const status = c.res ? c.res.status : 0;
  if (status >= 500) console.error("request failed", c.req.method, c.req.path, status);
});
app.onError((err, c) => {
  console.error("HANDLER ERROR", c.req.method, c.req.path, err && err.message);
  return c.json({ error: "internal", message: err && err.message }, 500);
});
app.route("/api", core);
app.route("/api", ledger);
app.route("/api", certs);
app.route("/api", records);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "not_found" }, 404);
  return serveIndex(c);
});

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
};

app.get("*", (c, next) => {
  const p = decodeURIComponent(new URL(c.req.url).pathname);
  if (p.startsWith("/api/")) return next();
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) return c.text("forbidden", 403);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file);
    const body = fs.readFileSync(file);
    const headers = {
      "content-type": MIME[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-cache" : "public, max-age=604800",
    };
    return new Response(body, { headers });
  }
  return serveIndex(c);
});

function serveIndex(c) {
  const index = path.join(PUBLIC_DIR, "index.html");
  if (!fs.existsSync(index)) return c.text("not built", 500);
  return new Response(fs.readFileSync(index), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
}

/* ------------------------------------------------- boot: migrate, seed, fixup */
async function waitForDb() {
  for (let i = 0; i < 60; i++) {
    try {
      await db().query("SELECT 1");
      return;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("postgres did not become reachable");
}

async function migrate() {
  if (process.env.SEED_RESET === "1") {
    // the app user may not own the schema; drop every table it can see instead
    const t = await db().query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'"
    );
    for (const row of t.rows) {
      await db().query('DROP TABLE IF EXISTS public."' + row.tablename + '" CASCADE');
    }
  }
  const schema = fs.readFileSync(path.join(here, "schema.sql"), "utf8");
  await db().query(schema);
  const has = await one("SELECT 1 FROM schema_version WHERE version=1");
  if (!has) await db().query("INSERT INTO schema_version (version) VALUES (1)");
}

async function seedIfNeeded() {
  const row = await one("SELECT 1 FROM site LIMIT 1");
  if (row) return false;
  const seed = fs.readFileSync(path.join(here, "seed.sql"), "utf8");
  await db().query(seed);
  return true;
}

async function fixupRecordChain() {
  // rebuild content for seeded rows, then chain the digests so /api/record/check holds
  const rows = await q("SELECT * FROM record_entry ORDER BY seq");
  let prev = "0".repeat(64);
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    for (const e of rows) {
      let content = e.content;
      if (!content) {
        content = JSON.stringify({
          act: e.act, person: e.person, site: e.site, object: e.object,
          detail: e.detail || {}, refused: e.refused || null, at: e.at,
        });
        await client.query("UPDATE record_entry SET content=$2 WHERE seq=$1", [e.seq, content]);
      }
      const digest = sha256(prev + "\n" + content);
      await client.query("UPDATE record_entry SET digest=$2, prev_digest=$3 WHERE seq=$1", [e.seq, digest, prev]);
      prev = digest;
    }
    // the seeded legal hold stands on the signing of CERT-PILOT-000001
    const signing = await client.query("SELECT seq FROM record_entry WHERE act='certificate_signed' AND object='CERT-PILOT-000001' LIMIT 1");
    if (signing.rows.length) {
      await client.query("UPDATE record_entry SET legal_hold=true WHERE seq=$1", [signing.rows[0].seq]);
      await client.query(
        "INSERT INTO legal_hold (reference, seq, placed_on, placed_by) VALUES ('HLD-0001',$1,'2026-04-18','auditor@example.com') ON CONFLICT DO NOTHING",
        [signing.rows[0].seq]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  await waitForDb();
  await migrate();
  const seeded = await seedIfNeeded();
  if (seeded) await fixupRecordChain();
  const server = serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
    console.log("ravel listening on 0.0.0.0:" + info.port);
  });
  const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => {
  console.error("boot failed", e);
  process.exit(1);
});
