import "../../../chunks/db_C-9WqIXq.mjs";
import { renderers } from "../../../renderers.mjs";
const GET = async ({ params }) => {
  const name = params.name ?? "";
  const releases = await getReleaseFromArtifact(name);
  if (!releases) return new Response("That page does not exist.", { status: 404 });
  const target = Math.min(releases.size_bytes, 64 * 1024);
  const payload = new Uint8Array(target);
  const digest = releases.sha256;
  for (let i = 0; i < target; i++) {
    payload[i] = parseInt(digest.slice(i % 64 * 2, i % 64 * 2 + 2), 16);
  }
  return new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(target),
      "X-Artifact-Truncated-To": String(target),
      "X-Artifact-Full-Size": String(releases.size_bytes),
      "X-Artifact-Sha256": digest
    }
  });
};
async function getReleaseFromArtifact(name) {
  const { listReleases } = await import("../../../chunks/releases_B2Vn5YuN.mjs");
  const all = await listReleases();
  const hit = all.find((r) => r.artifact_name === name);
  if (hit) return hit;
  return null;
}
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
