import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { Readable } from 'node:stream';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
};

export function contentType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export function safeJoin(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const cleaned = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = resolve(join(root, cleaned));
  if (!full.startsWith(resolve(root))) return null;
  return full;
}

export async function readAsset(path: string): Promise<{ body: Buffer; type: string } | null> {
  try {
    const s = await stat(path);
    if (!s.isFile()) return null;
    return { body: await readFile(path), type: contentType(path) };
  } catch {
    return null;
  }
}

export async function streamAsset(path: string): Promise<Response | null> {
  try {
    const s = await stat(path);
    if (!s.isFile()) return null;
    const stream = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream;
    const immutable = /\.[0-9A-Z]{8,}\.(js|css|woff2?|png|svg)$/i.test(path);
    return new Response(stream, {
      headers: {
        'content-type': contentType(path),
        'content-length': String(s.size),
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      },
    });
  } catch {
    return null;
  }
}
