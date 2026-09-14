// Builds the Preact client into server/public. No source maps, one CSS, three woff2 files.
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const src = path.join(root, "client", "src");
const out = path.join(root, "server", "public");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "assets"), { recursive: true });

const html = fs.readFileSync(path.join(src, "index.html"), "utf8");

const res = await build({
  entryPoints: [path.join(src, "boot.mjs")],
  bundle: true,
  format: "esm",
  minify: true,
  sourcemap: false,
  write: false,
  target: ["es2020"],
  legalComments: "none",
  jsx: "automatic",
  jsxImportSource: "preact",
  define: { "process.env.NODE_ENV": '"production"' },
});
const js = res.outputFiles[0].text;
const entry = "entry-" + hash(js) + ".mjs";
fs.writeFileSync(path.join(out, "assets", entry), js);
fs.copyFileSync(path.join(src, "styles.css"), path.join(out, "assets", "styles.css"));
for (const f of ["EBGaramond.woff2", "Archivo.woff2", "JetBrainsMono.woff2"])
  fs.copyFileSync(path.join(root, "vendor", "fonts", f), path.join(out, "assets", f));
copyDir(path.join(src, "vectors"), path.join(out, "assets", "vectors"));
fs.writeFileSync(path.join(out, "index.html"), html.replace("{{ENTRY}}", "/assets/" + entry).replace("{{CSS}}", "/assets/styles.css"));

function copyDir(a, b) {
  if (!fs.existsSync(a)) return;
  fs.mkdirSync(b, { recursive: true });
  for (const e of fs.readdirSync(a, { withFileTypes: true })) {
    if (e.isDirectory()) copyDir(path.join(a, e.name), path.join(b, e.name));
    else fs.copyFileSync(path.join(a, e.name), path.join(b, e.name));
  }
}
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
console.log("client built:", entry, js.length, "bytes");
