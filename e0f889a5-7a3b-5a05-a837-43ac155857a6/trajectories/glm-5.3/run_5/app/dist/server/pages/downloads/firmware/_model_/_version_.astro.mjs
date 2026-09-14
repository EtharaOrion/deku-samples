import { firmwareForProduct } from "../../../../chunks/releases_B2Vn5YuN.mjs";
import { renderers } from "../../../../renderers.mjs";
const GET = async ({ params }) => {
  const { model, version } = params;
  if (!model || !version) return new Response("That page does not exist.", { status: 404 });
  const { product, entries } = await firmwareForProduct(model);
  const entry = entries.find((e) => e.version === version);
  if (!entry) return new Response("That page does not exist.", { status: 404 });
  const target = Math.min(entry.size_bytes, 64 * 1024);
  const payload = new Uint8Array(target);
  for (let i = 0; i < target; i++) {
    payload[i] = parseInt(entry.sha256.slice(i % 64 * 2, i % 64 * 2 + 2), 16);
  }
  return new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="vela-${product}-${entry.version}.bin"`,
      "Content-Length": String(target),
      "X-Artifact-Full-Size": String(entry.size_bytes),
      "X-Artifact-Sha256": entry.sha256
    }
  });
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
