/**
 * Generates the downloadable release artifacts deterministically so the byte
 * size the app reports is the size of the file it actually serves, and prints
 * each file's true hexadecimal digest for the seed to carry.
 */
import { mkdirSync, writeFileSync, statSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const HERE = fileURLToPath(import.meta.url);
const APP_ROOT = resolve(HERE, '..', '..');
const DIR = process.env.ARTIFACT_DIR ? resolve(process.env.ARTIFACT_DIR) : join(APP_ROOT, '.downloads-cache');

const ARTIFACTS = [
  { name: 'arranger-2.0.0.dmg', size: 154876459 },
  { name: 'arranger-1.4.4.dmg', size: 160301059 },
  { name: 'arranger-1.4.3.dmg', size: 158220144 },
  { name: 'arranger-1.4.2.dmg', size: 157903622 },
  { name: 'vela-cricket-7.2.fw', size: 20746640 },
  { name: 'vela-cricket-7.0.fw', size: 20258900 },
  { name: 'vela-cricket-6.11.fw', size: 20226667 },
  { name: 'vela-a1-2.4.fw', size: 20088880 },
];

function makeBuffer(name, size) {
  const parts = [];
  const header = Buffer.from(name + '\n');
  parts.push(header);
  const chunk = Buffer.alloc(256);
  for (let i = 0; i < 256; i++) chunk[i] = i;
  const block = Buffer.concat(Array(8).fill(chunk));
  let written = header.length;
  while (written + block.length <= size) {
    parts.push(block);
    written += block.length;
  }
  if (written < size) {
    const rest = Buffer.alloc(size - written);
    for (let i = 0; i < rest.length; i++) rest[i] = i % 251;
    parts.push(rest);
  }
  return Buffer.concat(parts);
}

mkdirSync(DIR, { recursive: true });

for (const { name, size } of ARTIFACTS) {
  const path = join(DIR, name);
  if (!existsSync(path) || statSync(path).size !== size) {
    writeFileSync(path, makeBuffer(name, size));
  }
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
  process.stdout.write(`${name} ${statSync(path).size} ${digest}\n`);
}
