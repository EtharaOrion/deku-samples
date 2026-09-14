import type { APIRoute } from 'astro';
import { firmwareForProduct } from '../../../../server/releases.js';

export const GET: APIRoute = async ({ params }) => {
  const { model, version } = params;
  if (!model || !version) return new Response('That page does not exist.', { status: 404 });
  const { product, entries } = await firmwareForProduct(model);
  const entry = entries.find((e) => e.version === version);
  if (!entry) return new Response('That page does not exist.', { status: 404 });
  const target = Math.min(entry.size_bytes, 64 * 1024);
  const payload = new Uint8Array(target);
  for (let i = 0; i < target; i++) {
    payload[i] = parseInt(entry.sha256.slice((i % 64) * 2, (i % 64) * 2 + 2), 16);
  }
  return new Response(payload, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="vela-${product}-${entry.version}.bin"`,
      'Content-Length': String(target),
      'X-Artifact-Full-Size': String(entry.size_bytes),
      'X-Artifact-Sha256': entry.sha256,
    },
  });
};
