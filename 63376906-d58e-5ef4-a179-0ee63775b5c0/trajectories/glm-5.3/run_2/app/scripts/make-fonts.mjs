// Subsets the Liberation faces into WOFF2 served by this origin.
// Liberation is SIL OFL 1.1 licensed; subsetting and redistribution are permitted.
import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.RAVEL_FONT_OUT || path.join(here, "..", "client", "public", "fonts");
mkdirSync(out, { recursive: true });

try {
  execFileSync("python3", [path.join(here, "subset-fonts.py")], {
    env: { ...process.env, RAVEL_FONT_OUT: out },
    stdio: "inherit",
  });
} catch (e) {
  // A build without the subsetter available still needs faces to ship; the
  // faces are copied whole rather than silently absent.
  const src = "/usr/share/fonts/truetype/liberation";
  for (const f of [
    "LiberationSerif-Regular.ttf",
    "LiberationSerif-Bold.ttf",
    "LiberationSerif-Italic.ttf",
    "LiberationSans-Regular.ttf",
    "LiberationSans-Bold.ttf",
    "LiberationMono-Regular.ttf",
    "LiberationMono-Bold.ttf",
  ]) {
    copyFileSync(path.join(src, f), path.join(out, f));
  }
}
