import { c as createComponent, e as renderHead, r as renderTemplate, a as addAttribute, d as renderComponent } from '../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
/* empty css                                    */
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  const paragraphs = [
    "We make two cameras and we sell them ourselves. That is the whole of the plan and this letter is the plan written out.",
    "The table in the photograph is the table in the workshop. It is birch, it is older than the company, and everything we have ever shipped was laid out on it before it went into a box.",
    "A camera is a tool for noticing. The good ones get out of the way, and the rest make you negotiate. We wanted a camera that disappeared into the hand, so we built one, and then we built a smaller one.",
    "The Vela A1 is the full-frame camera we wanted on the table. It has one sensor, two controls and no menu system you will need a weekend for. It is machined from a single billet and it will outlast the phone you are probably reading this on.",
    "Vela Cricket is the small one. It shares the A1 mount and its colour science and it fits in a coat pocket. Most of the photographs we care about were taken with the small one, because it was the one we had with us.",
    "We do not make a lens for every purpose. We make three, and each of them is sharp where photographs actually happen.",
    "Both cameras are serviced here, on this table, by the people who assembled them. When you write to us you reach the workshop.",
    "The software is called Arranger. It is free, it runs on a Mac, and it does not want an account. It reads a card, it keeps a library, and it leaves the files where you put them.",
    "Firmware for both cameras lives on this site. You can install it from Arranger, or from a browser if Arranger cannot see your camera. A camera should get better after you buy it, not older.",
    "This is the part of the letter where a company usually explains its values. Ours are short enough to fit in a sentence: build tools you would keep, tell the truth about what they do, and repair what you sold.",
    "There is a kind of electronics made for the mass market that is designed to be replaced. It is light, it is cheap, and it is in a drawer within two years. We are not in that business, and everything we make argues against it.",
    "You can see the argument in the screws. Our cameras open with a driver you can buy, not a tool you cannot. The battery is a standard cell. The firmware images are signed and public. None of this is clever. It is only a decision, made once, on your behalf, and we think you will notice it the first time something goes wrong.",
    "Everything after this letter is operational. Prices, stock, delivery, firmware, the archive of every release we have shipped. It is deliberately plain. It is a counter, not a campaign.",
    "If you are reading this on a phone, the film behind these words is a table in a workshop in Portland, and the hands in it belong to people who will pack your order.",
    "Thank you for reading to the end. The footer below is the way out, and the shop is the first door in it.",
    "See you soon."
  ];
  return renderTemplate`<html lang="en"> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>the table — Vela</title>${renderHead()}</head> <body class="surface-dark"> <a class="skip-link" href="#letter">Skip to the letter</a> <div class="stage" aria-hidden="true"> <video class="film" muted playsinline loop preload="none" tabindex="-1"></video> <div class="still"></div> <div class="speckle"></div> <div class="darken"></div> <div class="flat"></div> </div> <a class="mark" href="/">vela</a> <article id="letter" class="letter"> <header class="letter-head"> <h1 class="letter-title">the table</h1> <p class="dateline">June 1, 2026</p> </header> <div class="letter-copy"> <div class="letter-body flow"> ${paragraphs.map((t, i) => i === paragraphs.length - 1 ? renderTemplate`<p class="closing">${t}</p>` : renderTemplate`<p${addAttribute(i, "data-para")}>${t}</p>`)} </div> <div class="letter-driven" aria-hidden="true" inert> ${paragraphs.map((t, i) => i === paragraphs.length - 1 ? renderTemplate`<p class="closing">${t}</p>` : renderTemplate`<p${addAttribute(i, "data-driven")}>${t}</p>`)} </div> </div> </article> <footer class="foot"> ${renderComponent($$result, "foot-canvas", "foot-canvas", {})} <div class="foot-row"> <span class="foot-mark">vela</span> <span class="foot-reserved">All rights reserved</span> <nav class="foot-links" aria-label="Footer"> <a href="/shop">Shop</a> <span>Support</span><span>Terms</span><span>Privacy</span><span>Jobs</span><span>Contact</span> </nav> </div> </footer>  </body> </html>`;
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
