import type { APIRoute } from 'astro';
import { listReleases } from '../../server/releases.ts';
import { productByHandle } from '../../server/catalog.ts';
import { firmwareForProduct } from '../../server/flash.ts';

function artifactBytes(seed: string, size: number, sha: string): Uint8Array {
  const buf = new Uint8Array(size);
  const head = new TextEncoder().encode(`vela-artifact:${seed}:${sha}\n`);
  buf.set(head.subarray(0, Math.min(head.length, size)));
  let state = 0x2f6e4021;
  for (let i = head.length; i < size; i++) {
    state = (Math.imul(state, 1103515245) + 12345 + i) & 0x7fffffff;
    buf[i] = (state >>> 16) & 0xff;
  }
  return buf;
}

function fileResponse(name: string, bytes: Uint8Array) {
  return new Response(bytes as any, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'public, max-age=3600',
    },
  });
}

export const GET: APIRoute = async ({ params }) => {
  const rest = params.rest || '';
  const slash = rest.indexOf('/');
  if (slash < 0) return new Response('That page does not exist.', { status: 404 });
  const kind = rest.slice(0, slash);
  const name = rest.slice(slash + 1);

  if (kind === 'arranger') {
    const { rows } = await listReleases(200, null);
    const match = rows.find((r: any) => r.artifact_name === name);
    if (!match) return new Response('That page does not exist.', { status: 404 });
    return fileResponse(match.artifact_name, artifactBytes(`arranger/${match.artifact_name}`, Number(match.size_bytes), match.sha256));
  }

  if (kind === 'firmware') {
    const m = name.match(/^cricket-(.+)\.bin$/);
    if (!m) return new Response('That page does not exist.', { status: 404 });
    const cricket = await productByHandle('compact');
    const firmware = cricket ? await firmwareForProduct(cricket.id) : [];
    const match = firmware.find((f: any) => f.version === m[1]);
    if (!match) return new Response('That page does not exist.', { status: 404 });
    return fileResponse(`vela-cricket-firmware-${match.version}.bin`, artifactBytes(`firmware/${match.version}`, Number(match.size_bytes), match.sha256));
  }

  return new Response('That page does not exist.', { status: 404 });
};
