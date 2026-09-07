import { e as createComponent, m as maybeRenderHead, r as renderTemplate, h as createAstro, o as renderHead, g as addAttribute, k as renderComponent, n as renderScript } from '../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
/* empty css                                    */
/* empty css                                 */
import 'clsx';
import { l as letter } from '../chunks/seed-data_DiCvfGeY.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Footer = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Footer;
  const { canvas = true } = Astro2.props;
  const entries = ["Shop", "Support", "Terms", "Privacy", "Jobs", "Contact"];
  return renderTemplate`${maybeRenderHead()}<footer class="footer ground-dark"> ${canvas && renderTemplate`<div class="footer-canvas-wrap"> <canvas class="footer-canvas" id="footer-canvas" data-word="VELA" aria-hidden="true" role="presentation"></canvas> </div>`} <div class="footer-bottom"> <span class="footer-mark">VELA</span> <span class="footer-rights">All rights reserved</span> <ul class="footer-links"> ${entries.map((e) => renderTemplate`<li>${e === "Shop" ? renderTemplate`<a href="/shop">Shop</a>` : renderTemplate`<span class="plain">${e}</span>`}</li>`)} </ul> </div> </footer>`;
}, "/app/src/components/Footer.astro", void 0);

const $$Index = createComponent(($$result, $$props, $$slots) => {
  const sides = letter.paragraphs.map((_, i) => {
    if (letter.pulledTogether.includes(i)) return "start";
    return i % 2 === 0 ? "start" : "end";
  });
  return renderTemplate`<html lang="en"> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Vela</title><meta name="description" content="A letter from the table two cameras are built on."><link rel="preload" href="/fonts/Archivo-Regular.woff2" as="font" type="font/woff2" crossorigin><link rel="icon" href="/favicon.svg" type="image/svg+xml">${renderHead()}</head> <body class="ground-dark letter-page"> <a class="skip-link" href="#letter">Skip to the letter</a> <a class="letter-wordmark" href="/" aria-label="Vela, home"><span aria-hidden="true">VELA</span></a> <div class="stage"> <!-- The film is inert: no controls, not focusable, hidden from assistive
           technology, and dragging on it scrolls the page. --> <div class="stage-film" aria-hidden="true"> <div class="stage-fallback"></div> <video class="stage-video" src="/film/table.webm" muted playsinline loop preload="metadata" tabindex="-1" aria-hidden="true" disablepictureinpicture></video> <img class="stage-still" src="/film/table-still.jpg" alt="" width="1280" height="720" decoding="async"> <img class="stage-speckle" src="/film/speckle.png" alt="" aria-hidden="true"> <div class="stage-darken"></div> <div class="stage-flat"></div> </div> <article class="letter" id="letter"> <div class="letter-inner"> <h1 class="letter-title">${letter.title}</h1> <p class="letter-dateline">${letter.dateline}</p> <!-- Normal flow: what the markup carries and what a reader with no
               scripting receives, in correct reading order. --> <div class="letter-body"> ${letter.paragraphs.map((p) => renderTemplate`<p>${p}</p>`)} <p class="letter-closing">${letter.closing}</p> </div> <!-- The inert layer the scroll drives, hidden from assistive
               technology. It is never the only copy. --> <div class="letter-driven" aria-hidden="true"> ${letter.paragraphs.map((p, i) => renderTemplate`<div${addAttribute(`block side-${sides[i]}`, "class")}><p>${p}</p></div>`)} <div class="block side-start"><p class="letter-closing">${letter.closing}</p></div> </div> </div> </article> </div> ${renderComponent($$result, "Footer", $$Footer, {})} ${renderScript($$result, "/app/src/pages/index.astro?astro&type=script&index=0&lang.ts")} </body> </html>`;
}, "/app/src/pages/index.astro", void 0);

const $$file = "/app/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
