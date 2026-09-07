import { e as createComponent, g as addAttribute, p as renderHead, o as renderSlot, r as renderTemplate, h as createAstro } from './astro/server_rOUT-VGP.mjs';
import 'piccolore';
import 'clsx';
/* empty css                            */

const $$Astro = createAstro();
const $$Base = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Base;
  const { title = "Vela", description = "Vela designs, builds and sells two cameras.", ground = "ground-light" } = Astro2.props;
  return renderTemplate`<html lang="en"> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description"${addAttribute(description, "content")}><link rel="preload" href="/fonts/vela-grotesque-400.woff2" as="font" type="font/woff2" crossorigin><link rel="icon" href="/favicon.svg" type="image/svg+xml">${renderHead()}</head> <body${addAttribute(ground, "class")}> ${renderSlot($$result, $$slots["default"])} </body></html>`;
}, "/app/src/layouts/Base.astro", void 0);

export { $$Base as $ };
