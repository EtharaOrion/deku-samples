// Copies the public assets beside the built bundle and writes the static shell
// that the API serves for every non-API route.
import { copyFileSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

mkdirSync('dist', { recursive: true });

// fonts and favicon live under /fonts.css, /fonts/*, /favicon.svg
if (existsSync('client/public/fonts.css')) copyFileSync('client/public/fonts.css', 'dist/fonts.css');
mkdirSync('dist/fonts', { recursive: true });
for (const f of (await import('node:fs')).readdirSync('client/public/fonts')) {
  copyFileSync('client/public/fonts/' + f, 'dist/fonts/' + f);
}
if (existsSync('client/public/favicon.svg')) copyFileSync('client/public/favicon.svg', 'dist/favicon.svg');

// index.html built by vite already sits in dist; rewrite its asset paths are fine.
const html = readFileSync('dist/index.html', 'utf8');
writeFileSync('dist/index.html', html);
console.log('static assets staged');
