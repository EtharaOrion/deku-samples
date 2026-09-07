// Copies the Angular production output next to the server as web-dist.
import { cpSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const candidates = [join(root, 'web', 'dist', 'web', 'browser'), join(root, 'web', 'dist', 'web')];
const src = candidates.find((p) => existsSync(p));
if (!src) throw new Error('Angular build output not found. Run `npm run build -w web` first.');
const dest = join(root, 'web-dist');
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('packed', src, '->', dest);
