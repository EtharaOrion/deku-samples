import { a as listReleases } from "../../chunks/releases_CuqIRam6.mjs";
import { p as productByHandle } from "../../chunks/catalog_BnA2aLlY.mjs";
import { f as firmwareForProduct } from "../../chunks/flash_ChrB-_fE.mjs";
import { renderers } from "../../renderers.mjs";
function artifactBytes(seed, size, sha) {
  const buf = new Uint8Array(size);
  const head = new TextEncoder().encode(`vela-artifact:${seed}:${sha}
`);
  buf.set(head.subarray(0, Math.min(head.length, size)));
  let state = 795754529;
  for (let i = head.length; i < size; i++) {
    state = Math.imul(state, 1103515245) + 12345 + i & 2147483647;
    buf[i] = state >>> 16 & 255;
  }
  return buf;
}
function fileResponse(name, bytes) {
  return new Response(bytes, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(bytes.byteLength),
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "public, max-age=3600"
    }
  });
}
const GET = async ({ params }) => {
  const rest = params.rest || "";
  const slash = rest.indexOf("/");
  if (slash < 0) return new Response("That page does not exist.", { status: 404 });
  const kind = rest.slice(0, slash);
  const name = rest.slice(slash + 1);
  if (kind === "arranger") {
    const { rows } = await listReleases(200, null);
    const match = rows.find((r) => r.artifact_name === name);
    if (!match) return new Response("That page does not exist.", { status: 404 });
    return fileResponse(match.artifact_name, artifactBytes(`arranger/${match.artifact_name}`, Number(match.size_bytes), match.sha256));
  }
  if (kind === "firmware") {
    const m = name.match(/^cricket-(.+)\.bin$/);
    if (!m) return new Response("That page does not exist.", { status: 404 });
    const cricket = await productByHandle("compact");
    const firmware = cricket ? await firmwareForProduct(cricket.id) : [];
    const match = firmware.find((f) => f.version === m[1]);
    if (!match) return new Response("That page does not exist.", { status: 404 });
    return fileResponse(`vela-cricket-firmware-${match.version}.bin`, artifactBytes(`firmware/${match.version}`, Number(match.size_bytes), match.sha256));
  }
  return new Response("That page does not exist.", { status: 404 });
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
