import { c as createComponent, d as renderComponent, r as renderTemplate, m as maybeRenderHead } from "../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../chunks/App_CiTDO3Su.mjs";
import { renderers } from "../renderers.mjs";
const $$500 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Something went wrong" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="card"> <h1>Something went wrong at our end.</h1> <p>The error has been logged. Try again in a moment.</p> <p><a class="btn" href="/">Back to the letter</a></p> </div> ` })}`;
}, "/app/src/pages/500.astro", void 0);
const $$file = "/app/src/pages/500.astro";
const $$url = "/500";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$500,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
