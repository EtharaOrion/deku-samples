import { e as createComponent, g as addAttribute, o as renderHead, n as renderSlot, r as renderTemplate, h as createAstro } from './astro/server_BMi1VkyI.mjs';
import 'piccolore';
import 'clsx';
/* empty css                             */

const $$Astro = createAstro();
const $$Base = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Base;
  const { title, description = "Vela Electronics", ground = "light", bodyClass = "" } = Astro2.props;
  return renderTemplate`<html lang="en"${addAttribute(ground, "data-ground")}> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description"${addAttribute(description, "content")}><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/vela-grotesque-400.woff2" as="font" type="font/woff2" crossorigin>${renderHead()}</head> <body${addAttribute(bodyClass, "class")}${addAttribute(ground, "data-ground")}> <!-- Every page carries a skip link as its first focusable element. --> <a class="skip-link" href="#main">Skip to content</a> ${renderSlot($$result, $$slots["default"])} </body></html>`;
}, "/app/src/layouts/Base.astro", void 0);

export { $$Base as $ };
