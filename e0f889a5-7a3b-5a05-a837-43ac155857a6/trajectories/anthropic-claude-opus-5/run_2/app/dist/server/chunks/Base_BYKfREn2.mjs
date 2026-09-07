import { c as createComponent, a as addAttribute, f as renderHead, e as renderSlot, r as renderTemplate, b as createAstro } from './astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import 'clsx';
/* empty css                            */

const $$Astro = createAstro();
const $$Base = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Base;
  const { title, description = "Vela designs two cameras, has them built and sells them directly.", ground = "light", bodyClass = "" } = Astro2.props;
  return renderTemplate`<html lang="en"> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description"${addAttribute(description, "content")}><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/archivo-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/fonts/archivo-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>${renderHead()}</head> <body${addAttribute(`${ground === "dark" ? "ground-dark" : ""} ${bodyClass}`.trim(), "class")}> <!-- Every page carries a skip link as its first focusable element. --> <a class="skip-link" href="#main">Skip to content</a> ${renderSlot($$result, $$slots["default"])} </body></html>`;
}, "/app/src/layouts/Base.astro", void 0);

export { $$Base as $ };
