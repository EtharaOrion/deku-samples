import { build } from 'esbuild';

// Bundle the container entrypoint alongside the Astro output. The Astro handler
// stays external so it resolves at runtime from the same directory.
await build({
  entryPoints: ['src/entrypoint.ts'],
  outfile: 'dist/server/entrypoint.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  packages: 'external',
  external: ['./entry.mjs'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
console.log('dist/server/entrypoint.mjs written');
