import { c as createComponent, m as maybeRenderHead, r as renderTemplate, d as renderComponent, a as addAttribute } from '../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { $ as $$Base } from '../chunks/Base_BYKfREn2.mjs';
import 'clsx';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$FooterField = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<div class="field-wrap" data-astro-cid-buq4nzxl> <canvas data-footer-field aria-hidden="true" data-astro-cid-buq4nzxl></canvas> </div>  `;
}, "/app/src/islands/FooterField.astro", void 0);

const $$LetterFooter = createComponent(($$result, $$props, $$slots) => {
  const entries = ["Shop", "Support", "Terms", "Privacy", "Jobs", "Contact"];
  return renderTemplate`${maybeRenderHead()}<footer class="letter-footer ground-dark" data-astro-cid-t3zfvcr5> ${renderComponent($$result, "FooterField", $$FooterField, { "data-astro-cid-t3zfvcr5": true })} <div class="bottom-row" data-astro-cid-t3zfvcr5> <span class="wordmark" data-astro-cid-t3zfvcr5>Vela</span> <span class="rights" data-astro-cid-t3zfvcr5>All rights reserved</span> <ul class="entries" data-astro-cid-t3zfvcr5> ${entries.map((entry) => renderTemplate`<li data-astro-cid-t3zfvcr5> ${entry === "Shop" ? renderTemplate`<a href="/shop" data-astro-cid-t3zfvcr5>Shop</a>` : renderTemplate`<span data-astro-cid-t3zfvcr5>${entry}</span>`} </li>`)} </ul> </div> </footer> `;
}, "/app/src/components/LetterFooter.astro", void 0);

const $$ScrollDriver = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate``;
}, "/app/src/islands/ScrollDriver.astro", void 0);

const LETTER_TITLE = "the table";
const LETTER_DATELINE = "June 1, 2026";
const LETTER_CLOSING = "See you soon.";
const LETTER = [
  {
    side: "start",
    text: "This company began at a kitchen table with a camera in pieces on it. The shutter had failed after four years, which is roughly when they fail, and the manufacturer would not sell me the part. They offered me a discount on a new one instead."
  },
  {
    side: "end",
    text: "I took the body apart to see what a shutter costs. It is a stamped steel blade, two magnets and a flexible circuit. It is not a precious thing. The cost was never the part. The cost was that nobody had decided I should be allowed to have it."
  },
  {
    side: "start",
    text: "So the first decision was made for us before we had a product: every part we can sell you, we will sell you, and the underside of every camera has screws rather than glue."
  },
  {
    side: "end",
    text: "We make two cameras. The A1 is the one we build when nobody is asking us to hit a price, and the Cricket is the one we carry. They share a sensor pipeline, a mount, a cable and a battery, because two cameras that share nothing are two companies."
  },
  // The three consecutive paragraphs about mass market electronics, together.
  {
    side: "end",
    text: "Most electronics are not designed to be owned. They are designed to be replaced, on a schedule that was set before the first unit shipped, by a company that has already costed the replacement."
  },
  {
    side: "end",
    text: "The mechanism is rarely dramatic. A battery is glued in. A screw is a shape no one sells a driver for. A firmware update quietly drops a format. Support ends on a date nobody published. None of it is malice and all of it is a decision."
  },
  {
    side: "end",
    text: "The result is a market where the honest thing, a machine that lasts fifteen years and can be fixed in the fourteenth, is the thing nobody is incentivised to build. We would like to be a small piece of evidence that it can be built anyway."
  },
  {
    side: "start",
    text: "Everything we sell has a support date on it, and the date is published on the day the product goes on sale, not on the day we stop caring. When we discontinued the monitor mount we did not delete its page. It is still there with its date on it."
  },
  {
    side: "end",
    text: "A camera outlives the order that bought it. That sounds obvious, and almost no shop is built that way. A serial number is a record in its own right here: you can register a camera you bought secondhand, and you can hand it on when you sell it."
  },
  {
    side: "start",
    text: "The software is free and always will be. Arranger reads your cards, writes firmware and does not have an account system, because a photograph on your own disk is not something you should have to log in to reach."
  },
  {
    side: "end",
    text: "We keep every release note we have ever written, including the ones about our own mistakes. Version 1.4.2 exists because 1.4.3 broke an import path on the same day, and both of them are still listed, in build order, with the reason."
  },
  {
    side: "start",
    text: "When a camera stops talking to the application there is a page on this site that writes firmware directly from the browser. It works on a camera that is registered to somebody else, and on one whose warranty ran out years ago, because a repair is not a privilege."
  },
  {
    side: "end",
    text: "We sell directly. There is no reseller margin, no distributor and no retail partner asking for a colourway that will move units. It means we are slower and smaller. It also means the price on the page is the price, and we answer for it."
  },
  {
    side: "start",
    text: "We are eleven people. Four of us build, three write software, two answer mail, and two do everything else. The workshop is one room with the table this letter is named after in the middle of it, and most days it looks like the picture behind these words."
  },
  {
    side: "end",
    text: "If you are reading this deciding whether to spend nine hundred dollars with a company you had not heard of last week: buy the small one first. It is the honest introduction, it does the same thing, and if we are wrong about all of this you are out three hundred rather than nine."
  },
  {
    side: "start",
    text: "Thank you for reading this far. There is a shop through the footer below, and a firmware installer, and every release we have shipped. If you already own one of our cameras and something is wrong with it, that is the part of this we care about most."
  }
];

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Vela \u2014 the table", "ground": "dark", "bodyClass": "letter-page", "data-astro-cid-j7pv25f6": true }, { "default": ($$result2) => renderTemplate`  ${maybeRenderHead()}<div class="wordmark-fixed" data-astro-cid-j7pv25f6><a href="/" data-astro-cid-j7pv25f6>Vela</a></div>  <div class="stage" data-stage aria-hidden="true" data-astro-cid-j7pv25f6> <video class="film" autoplay muted loop playsinline preload="metadata" poster="/media/table-still.jpg" tabindex="-1" data-astro-cid-j7pv25f6> <source src="/media/table.webm" type="video/webm" data-astro-cid-j7pv25f6> <source src="/media/table.mp4" type="video/mp4" data-astro-cid-j7pv25f6> </video> <div class="still" data-still data-astro-cid-j7pv25f6> <img src="/media/table-still.jpg" alt="" width="1280" height="720" data-astro-cid-j7pv25f6> </div> <div class="speckle" data-astro-cid-j7pv25f6></div> <div class="veil" data-veil data-astro-cid-j7pv25f6></div> <div class="flat" data-flat data-astro-cid-j7pv25f6></div> </div> <main id="main" class="letter" data-astro-cid-j7pv25f6> <header class="letter-head" data-astro-cid-j7pv25f6> <h1 class="display" data-astro-cid-j7pv25f6>${LETTER_TITLE}</h1> <p class="dateline" data-astro-cid-j7pv25f6>${LETTER_DATELINE}</p> </header> <!--
      Every paragraph exists twice: once in normal flow, which is what the markup
      carries and what a reader with no scripting receives in correct reading
      order, and once in an inert layer the scroll drives.
    --> <div class="letter-body" data-astro-cid-j7pv25f6> ${LETTER.map((p) => renderTemplate`<p data-astro-cid-j7pv25f6>${p.text}</p>`)} <p class="closing" data-astro-cid-j7pv25f6>${LETTER_CLOSING}</p> </div> </main> <div class="driven" data-driven aria-hidden="true" data-astro-cid-j7pv25f6> ${LETTER.map((p) => renderTemplate`<div${addAttribute(`driven-block side-${p.side}`, "class")} data-block data-astro-cid-j7pv25f6> <p data-astro-cid-j7pv25f6>${p.text}</p> </div>`)} </div> ${renderComponent($$result2, "LetterFooter", $$LetterFooter, { "data-astro-cid-j7pv25f6": true })} ${renderComponent($$result2, "ScrollDriver", $$ScrollDriver, { "data-astro-cid-j7pv25f6": true })} ` })}  <noscript> <style>
    /* With no scripting the normal-flow copy is what reads, at every width. */
    .letter-body { display: block !important; }
    .driven { display: none !important; }
  </style> </noscript>`;
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
