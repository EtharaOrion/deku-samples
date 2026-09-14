#!/usr/bin/env node
// Build the server bundle (CommonJS-free ESM) from TypeScript into server/dist.
import { build } from 'esbuild';
import { rmSync, mkdirSync } from 'node:fs';

rmSync('server/dist', { recursive: true, force: true });
mkdirSync('server/dist', { recursive: true });

await build({
  entryPoints: ['server/start.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'server/dist/start.mjs',
  resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.css', '.json'],
  banner: { js: "import { createRequire } from 'node:module'; import nodePath from 'node:path'; const require = createRequire(import.meta.url);" },
  loader: { '.ts': 'ts' },
  external: ['pg', 'pg-native', 'nodemailer'],
  sourcemap: false,
  minify: false,
  logLevel: 'info'
});

// copy sql files
import { copyFileSync } from 'node:fs';
copyFileSync('server/schema.sql', 'server/dist/schema.sql');
copyFileSync('server/seed.sql', 'server/dist/seed.sql');

// seed entry point as its own bundle
await build({
  entryPoints: ['server/seed.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'server/dist/seed.mjs',
  loader: { '.ts': 'ts' },
  external: ['pg', 'pg-native', 'nodemailer'],
  sourcemap: false,
  minify: false,
  logLevel: 'info'
});
console.log('server built');
