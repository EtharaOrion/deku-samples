import { e as createComponent, g as addAttribute, p as renderHead, o as renderSlot, r as renderTemplate, h as createAstro, m as maybeRenderHead } from './astro/server_Dku1auYb.mjs';
import 'piccolore';
import 'clsx';
/* empty css                            */
/* empty css                         */

const $$Astro$1 = createAstro();
const $$Base = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$Base;
  const { title, description = "Vela designs, builds and sells two cameras.", ground = "light" } = Astro2.props;
  return renderTemplate`<html lang="en"> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description"${addAttribute(description, "content")}><link rel="preload" href="/fonts/archivo-400.woff2" as="font" type="font/woff2" crossorigin><link rel="icon" href="/favicon.svg" type="image/svg+xml">${renderHead()}</head> <!-- Every surface declares its own ground rather than inheriting one. --> <body${addAttribute(ground === "dark" ? "ground-dark" : "ground-light", "class")}> ${renderSlot($$result, $$slots["default"])} </body></html>`;
}, "/app/src/layouts/Base.astro", void 0);

const $$Astro = createAstro();
const $$Wordmark = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Wordmark;
  const { size = 20 } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<span class="wordmark"${addAttribute(`font-size:${size}px`, "style")} data-astro-cid-hhuuaa7r>vela</span> `;
}, "/app/src/components/Wordmark.astro", void 0);

export { $$Wordmark as $, $$Base as a };
