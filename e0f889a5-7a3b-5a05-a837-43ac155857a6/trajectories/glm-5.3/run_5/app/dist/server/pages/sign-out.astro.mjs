import { renderers } from "../renderers.mjs";
const POST = async ({ cookies, redirect }) => {
  cookies.delete("vela_token", { path: "/" });
  return redirect("/", 303);
};
const GET = async ({ cookies, redirect }) => {
  cookies.delete("vela_token", { path: "/" });
  return redirect("/", 303);
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  GET,
  POST
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
