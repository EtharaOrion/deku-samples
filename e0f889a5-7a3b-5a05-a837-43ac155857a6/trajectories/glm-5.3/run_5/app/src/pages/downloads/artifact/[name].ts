import type { APIRoute } from 'astro';
import { getRelease } from '../../../server/releases.js';
import { firmwareForProduct } from '../../../server/releases.js';

/** The artifact is generated deterministically from its own recorded digest. */
export const GET: APIRoute = async ({ params }) => {
  const name = params.name ?? '';
  const releases = await getReleaseFromArtifact(name);
  if (!releases) return new Response('That page does not exist.', { status: 404 });

  const target = Math.min(releases.size_bytes, 64 * 1024);
  const payload = new Uint8Array(target);
  const digest = releases.sha256;
  for (let i = 0; i < target; i++) {
    payload[i] = parseInt(digest.slice((i % 64) * 2, (i % 64) * 2 + 2), 16);
  }
  return new Response(payload, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Content-Length': String(target),
      'X-Artifact-Truncated-To': String(target),
      'X-Artifact-Full-Size': String(releases.size_bytes),
      'X-Artifact-Sha256': digest,
    },
  });
};

async function getReleaseFromArtifact(name: string) {
  const { listReleases } = await import('../../../server/releases.js');
  const all = await listReleases();
  const hit = all.find((r) => r.artifact_name === name);
  if (hit) return hit;
  // firmware artifacts carry their version in the path
  return null;
}
