import { build } from "esbuild";

await build({
  entryPoints: ["src/server/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.js",
  sourcemap: false,
  jsx: "automatic",
  jsxImportSource: "preact",
  loader: {
    ".tsx": "tsx",
    ".css": "empty",
  },
  banner: {
    js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
  },
});
