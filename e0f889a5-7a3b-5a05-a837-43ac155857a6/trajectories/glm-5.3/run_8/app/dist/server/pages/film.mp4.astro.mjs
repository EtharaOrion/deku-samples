import { renderers } from "../renderers.mjs";
const prerender = false;
async function GET() {
  return new Response("", {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": "0",
      "Cache-Control": "no-store"
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
