import { c as createComponent, r as renderTemplate, a as addAttribute, e as renderHead } from "../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import "clsx";
/* empty css                                   */
/* empty css                                 */
import { renderers } from "../renderers.mjs";
const LETTER = {
  title: "the table",
  dateline: "June 1, 2026",
  paragraphs: [
    "The table arrived before the company did. It is birch, two metres long, and it has a lamp at one end that has never once been switched off while work was happening on it.",
    "We built the first camera on it because we had nowhere else to build anything. Two people, one soldering iron and a workshop that was really a kitchen with better ventilation.",
    "We are not a camera company in the way that phrase usually gets used. We do not make a range. We do not refresh on a cycle. We make two cameras and we make them properly.",
    "The Vela A1 is the one we set out to build. The Vela Cricket is the one we set out to carry. Between them they cover the work we do and the way we think it should be done.",
    "Everything we sell is designed here, on this table, and built by a partner we have worked with since the second prototype. We have visited the line. We know the names of the people who run it.",
    "That matters because a camera is a long object. It outlives the order that bought it, the warranty that shipped with it and, sometimes, the company that made it. We intend to be here for all three.",
    "Firmware arrives when it is ready and not before. Arranger, the application that goes with the cameras, is free for anyone whether they own a Vela or not, because software that only works for paying customers is software nobody can trust.",
    "We keep the whole archive of every release we have ever shipped, in public, in order, with the dates we would rather forget. If a version of Arranger broke something for you, it is still there to read about.",
    "We do not run a subscription. We do not sell a cloud. There is no account you must keep alive for your camera to keep working, and there is no feature of the hardware we will unlock later for a fee.",
    "The mass market sells electronics the way a bakery sells bread. Something new each morning, yesterday's loaf at half price, and nothing with a name you could remember a year from now.",
    "That is one way to run a business and we hold nothing against it. It is not ours. A camera bought from us this year will still be a camera in ten, and we will still be answering for it.",
    "We sell direct because the alternative puts a shop between us and the person using the thing we made. If something is wrong, we want to be the ones who hear it and the ones who fix it.",
    "Support means parts, firmware and the means of keeping a camera alive. We stock cables and cases and we will keep stocking them while there are cameras in the field that need them.",
    "If you write to us you will reach one of six people. If you send a camera back you will get your own camera back, repaired, and not a refurbishment with someone else's scuffs on it.",
    "The table is where the work happens and this letter is the closest thing we have to a prospectus. There is no investor deck behind it and there is no roadmap slide at the end.",
    "Thank you for reading this far. What follows is the shop, the software and the means of keeping a camera alive, which is most of what we do all day."
  ],
  closing: "See you soon."
};
var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate(_a || (_a = __template(['<html lang="en" data-astro-cid-j7pv25f6> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>the table — Vela</title>', `</head> <body class="surface-dark letter-page" data-astro-cid-j7pv25f6> <a class="skip-link" href="#letter" data-astro-cid-j7pv25f6>Skip to the letter</a> <a class="wordmark" href="/" aria-label="Vela home" data-astro-cid-j7pv25f6>vela</a> <div class="stage" aria-hidden="true" data-stage data-astro-cid-j7pv25f6> <div class="still" data-still style="background-image:url('/film/still.svg')" data-astro-cid-j7pv25f6></div> <div class="speckle" data-speckle data-astro-cid-j7pv25f6></div> <div class="darken" data-darken data-astro-cid-j7pv25f6></div> <div class="flat" data-flat data-astro-cid-j7pv25f6></div> </div> <main id="letter" class="letter" data-astro-cid-j7pv25f6> <h1 class="letter-title" data-astro-cid-j7pv25f6>`, '</h1> <p class="dateline" data-astro-cid-j7pv25f6>', '</p> <div class="letter-flow" data-letter-flow data-astro-cid-j7pv25f6> ', ' <p class="closing" data-astro-cid-j7pv25f6>', '</p> </div> <div class="letter-driven" data-letter-driven aria-hidden="true" data-astro-cid-j7pv25f6> ', ' <p class="closing" data-astro-cid-j7pv25f6>', '</p> </div> </main> <footer class="footer surface-dark" data-astro-cid-j7pv25f6> <div class="footer-canvas-wrap" data-astro-cid-j7pv25f6> <canvas class="footer-canvas" data-footer-canvas aria-hidden="true" data-astro-cid-j7pv25f6></canvas> </div> <div class="footer-bottom" data-astro-cid-j7pv25f6> <span class="footer-wordmark" data-astro-cid-j7pv25f6>vela</span> <span class="footer-rights" data-astro-cid-j7pv25f6>All rights reserved</span> <nav class="footer-nav" aria-label="Footer" data-astro-cid-j7pv25f6> <a href="/shop" data-astro-cid-j7pv25f6>Shop</a> <span data-astro-cid-j7pv25f6>Support</span> <span data-astro-cid-j7pv25f6>Terms</span> <span data-astro-cid-j7pv25f6>Privacy</span> <span data-astro-cid-j7pv25f6>Jobs</span> <span data-astro-cid-j7pv25f6>Contact</span> </nav> </div> </footer> <script type="module" src="/scripts/letter.js" defer><\/script> </body> </html> '])), renderHead(), LETTER.title, LETTER.dateline, LETTER.paragraphs.map((p, i) => renderTemplate`<p class="para"${addAttribute(i, "data-para-index")} data-astro-cid-j7pv25f6>${p}</p>`), LETTER.closing, LETTER.paragraphs.map((p, i) => renderTemplate`<p class="para para-driven"${addAttribute(i, "data-driven-index")} data-astro-cid-j7pv25f6>${p}</p>`), LETTER.closing);
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
