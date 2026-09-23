import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.js";
import { createSchema } from "./db/schema.js";
import { seedIfEmpty } from "./db/seed/index.js";
import { authRoutes } from "./routes/auth.js";
import { publicRoutes } from "./routes/public.js";
import { feedstockRoutes } from "./routes/feedstock.js";
import { runsRoutes } from "./routes/runs.js";
import { lotsRoutes } from "./routes/lots.js";
import { ledgerRoutes } from "./routes/ledger.js";
import { carbonRoutes } from "./routes/carbon.js";
import { certificateRoutes } from "./routes/certificates.js";
import { commerceRoutes } from "./routes/commerce.js";
import { recordRoutes } from "./routes/record.js";
import { closedRoutes } from "./routes/closed.js";
import { pageRoutes } from "./ssr.js";

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "client");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function readAsset(urlPath: string): { body: Buffer; type: string } | null {
  let relative: string;
  try {
    relative = normalize(decodeURIComponent(urlPath));
  } catch {
    return null;
  }
  relative = relative.replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = join(CLIENT_ROOT, relative);
  if (!absolute.startsWith(CLIENT_ROOT)) return null;
  if (!existsSync(absolute) || !statSync(absolute).isFile()) return null;
  const type = CONTENT_TYPES[extname(absolute).toLowerCase()] ?? "application/octet-stream";
  return { body: readFileSync(absolute), type };
}

const app = new Hono();

app.get("/api/health", (c) => c.json({ status: "ok" }));

for (const routes of [
  authRoutes,
  publicRoutes,
  feedstockRoutes,
  runsRoutes,
  lotsRoutes,
  ledgerRoutes,
  carbonRoutes,
  certificateRoutes,
  commerceRoutes,
  recordRoutes,
  closedRoutes,
]) {
  app.route("/api", routes);
}

app.route("/", pageRoutes);

app.get("*", (c) => {
  const pathname = new URL(c.req.url).pathname;
  const asset = readAsset(pathname);
  if (asset) return c.body(asset.body, 200, { "Content-Type": asset.type });
  if (pathname.startsWith("/assets/")) return c.text("not found", 404);
  const shell = readAsset("/index.html");
  if (!shell) return c.text("client build missing", 500);
  return c.body(shell.body, 200, { "Content-Type": shell.type });
});

try {
  await createSchema();
  await seedIfEmpty();
} catch (error) {
  console.error("ravel failed to start", error);
  process.exit(1);
}

serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`ravel listening on 0.0.0.0:${info.port}`);
});
