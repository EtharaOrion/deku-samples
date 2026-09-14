import { e as createComponent, k as renderComponent, l as renderScript, r as renderTemplate, m as maybeRenderHead, g as addAttribute } from "../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { $ as $$Base } from "../chunks/Base_BSTyY1ZD.mjs";
/* empty css                                 */
import { renderers } from "../renderers.mjs";
const LETTER = {
  "title": "the table",
  "dateline": "June 1, 2026",
  "body": [
    "We started Vela because the cameras we wanted to use did not exist. That is the whole of it. Every other reason people give for starting a company turned up later, and most of them turned out to be consequences of that one sentence rather than causes of their own.",
    "I spent nine years repairing other people's cameras. I know what fails. It is rarely the sensor and it is rarely the glass. It is the strap lug, the door latch, the ribbon cable that was bent once at the factory and asked to survive ten thousand more bends. It is the part that somebody chose because it was two cents cheaper on a quote for forty thousand units.",
    "So we designed the parts nobody photographs. Our strap lugs are cut from one piece of the same billet as the top plate. Our doors have a gasket you can replace at a kitchen table with a fingernail and a pair of tweezers. Our firmware ships with a schematic of the board, because a camera you cannot open is a camera you do not own.",
    "Mass market electronics are built to a price and then to a date. The price is set by a competitor nobody has met and the date is set by a quarter. Neither of them knows what your hands are doing in October. Neither of them has held the camera you are holding.",
    "Mass market electronics are also built to be replaced. The assumption is that you will buy another one in three years, and the design is arranged so that buying another one is easier than fixing the one you have. We think that is a design decision and not a law of physics.",
    "Mass market electronics are designed for a person who does not exist. This person buys a new phone every autumn and never drops anything. We are not that person and, statistically, neither are you.",
    "We will sell you two cameras. We designed eleven. The nine we did not build are the nine we could not make hold still for ten years, and we would rather be small and right than large and sorry. A company that sells forty things cannot tell you which one to buy. A company that sells two can.",
    "Both cameras are built in the same workshop by the same six people. The A1 is the one you reach for when the light is going. The Cricket is the one that lives in a coat pocket. They share a sensor, they share a mount, they share a battery, and one charger runs the house.",
    "We publish our repair manual. We publish our firmware as a file you can put on a stick. We sell the cable. If you want to take the whole thing apart and put it back together, the only thing we ask is that you send us a photograph of what you find, because we are still learning where it fails.",
    "We answer our own mail. Not quickly, but ourselves. If something breaks out of warranty, write to us anyway. The warranty is a promise about our work, not a fence around it.",
    "We are not going to grow very fast. Growing fast means buying parts you have not tested from people you have not met. We have met our people and we have tested our parts and the cost of that is that you will sometimes wait for a camera.",
    "Our measure is whether a camera bought this year is still the best camera you own in ten. Everything on this page is downstream of that measure, including the price, including the wait, including the fact that we only make two.",
    "A word about price. The A1 costs more than a mass market body because the parts inside it cost more than the parts inside a mass market body. We could make it cheaper by making it worse, and then it would be somebody else's camera.",
    "Everything we make is on this page. There is no third model coming, no pro version, no limited run. When we have something better it will replace what is here at the same address, and the old one will keep working.",
    "We will keep the workshop table in the photograph above this letter for as long as we are in business. It is where every camera is signed off. When that table changes, you will know something has changed here.",
    "If you are still deciding, buy the Cricket. It is the one we would hand you across this table, and the one most of us carry."
  ],
  "closing": "See you soon."
};
const $$Index = createComponent(($$result, $$props, $$slots) => {
  const massStart = LETTER.body.findIndex((p) => p.startsWith("Mass market"));
  const sideFor = (i) => {
    if (i >= massStart && i < massStart + 3) return "right";
    return i % 2 === 0 ? "left" : "right";
  };
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "bare": true, "title": "the table — Vela", "data-astro-cid-j7pv25f6": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="letter-page" data-letter data-astro-cid-j7pv25f6> <a class="skip-link" href="#letter" data-astro-cid-j7pv25f6>Skip to the letter</a> <div class="stage" aria-hidden="true" data-stage data-astro-cid-j7pv25f6> <div class="stage__under" data-astro-cid-j7pv25f6></div> <video class="stage__film" data-film muted playsinline preload="none" tabindex="-1" data-astro-cid-j7pv25f6></video> <div class="stage__still" data-still data-astro-cid-j7pv25f6></div> <canvas class="stage__speckle" data-speckle data-astro-cid-j7pv25f6></canvas> <div class="stage__darken" data-darken data-astro-cid-j7pv25f6></div> <div class="stage__flat" data-flat data-astro-cid-j7pv25f6></div> </div> <header class="wordmark-bar" data-astro-cid-j7pv25f6> <a class="wordmark" href="/" data-astro-cid-j7pv25f6>Vela</a> </header> <article class="letter" id="letter" data-astro-cid-j7pv25f6> <h1 class="letter__title" data-astro-cid-j7pv25f6>${LETTER.title}</h1> <p class="letter__dateline" data-astro-cid-j7pv25f6>${LETTER.dateline}</p> <div class="letter__flow" data-astro-cid-j7pv25f6> ${LETTER.body.map((paragraph, i) => renderTemplate`<p${addAttribute(["letter__p", `letter__p--${sideFor(i)}`], "class:list")}${addAttribute(i, "data-paragraph")} data-astro-cid-j7pv25f6>${paragraph}</p>`)} <p class="letter__closing" data-astro-cid-j7pv25f6>${LETTER.closing}</p> </div> <div class="letter__driven" aria-hidden="true" data-driven data-astro-cid-j7pv25f6> ${LETTER.body.map((paragraph, i) => renderTemplate`<p${addAttribute(["letter__p", `letter__p--${sideFor(i)}`], "class:list")}${addAttribute(i, "data-driven-paragraph")} data-astro-cid-j7pv25f6>${paragraph}</p>`)} <p class="letter__closing" data-astro-cid-j7pv25f6>${LETTER.closing}</p> </div> </article> <footer class="footer" data-footer data-astro-cid-j7pv25f6> <div class="footer__canvas-wrap" data-astro-cid-j7pv25f6> <canvas class="footer__canvas" data-footer-canvas aria-hidden="true" data-astro-cid-j7pv25f6></canvas> </div> <div class="footer__bottom" data-astro-cid-j7pv25f6> <span class="footer__wordmark" data-astro-cid-j7pv25f6>Vela</span> <span class="footer__rights" data-astro-cid-j7pv25f6>All rights reserved</span> <nav class="footer__nav" aria-label="Footer" data-astro-cid-j7pv25f6> <a href="/shop" data-astro-cid-j7pv25f6>Shop</a> <span data-astro-cid-j7pv25f6>Support</span><span data-astro-cid-j7pv25f6>Terms</span><span data-astro-cid-j7pv25f6>Privacy</span><span data-astro-cid-j7pv25f6>Jobs</span><span data-astro-cid-j7pv25f6>Contact</span> </nav> </div> </footer> </div> ` })} ${renderScript($$result, "/app/src/pages/index.astro?astro&type=script&index=0&lang.ts")} ${renderScript($$result, "/app/src/pages/index.astro?astro&type=script&index=1&lang.ts")} `;
}, "/app/src/pages/index.astro", void 0);
const $$file = "/app/src/pages/index.astro";
const $$url = "";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
