import { renderers } from "../../../renderers.mjs";
const prerender = false;
async function GET({
  params
}) {
  const name = String(params.artifact || "download.bin");
  const body = `Vela distribution stand-in
${name}
Generated ${(/* @__PURE__ */ new Date()).toISOString()}
`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`
    }
  });
}
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  GET,
  prerender
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
