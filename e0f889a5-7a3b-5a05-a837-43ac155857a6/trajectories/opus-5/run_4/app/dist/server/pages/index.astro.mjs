import { e as createComponent, m as maybeRenderHead, l as renderScript, r as renderTemplate, k as renderComponent, g as addAttribute } from '../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Wordmark, a as $$Base } from '../chunks/Wordmark_Wku2sS-M.mjs';
import 'clsx';
/* empty css                                 */
import { useRef, useEffect } from 'preact/hooks';
import { jsx } from 'preact/jsx-runtime';
export { renderers } from '../renderers.mjs';

const $$Stage = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<div class="stage" data-stage aria-hidden="true" data-astro-cid-c5o4azsb> <video class="film" data-film muted loop playsinline preload="none" tabindex="-1" disablepictureinpicture data-astro-cid-c5o4azsb></video> <!-- The still frame is a generated gradient keyed to the letter's own
       colours, so nothing is fetched and there is no third-party asset. --> <div class="still" data-still data-astro-cid-c5o4azsb></div> <!-- A very faint animated speckle above the picture. --> <div class="speckle" data-speckle data-astro-cid-c5o4azsb></div> <!-- Darkens the whole stage from the bottom upward, in exact proportion to
       scroll. Never removed under reduced motion. --> <div class="darken" data-darken data-astro-cid-c5o4azsb></div> <!-- When the darkening is fully drawn this removes the film entirely, so the
       footer begins against true ground rather than a dimmed picture. --> <div class="flat" data-flat data-astro-cid-c5o4azsb></div> </div>  ${renderScript($$result, "/app/src/components/Stage.astro?astro&type=script&index=0&lang.ts")}`;
}, "/app/src/components/Stage.astro", void 0);

function FooterField() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return void 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return void 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dots = [];
    let raf = 0;
    let running = false;
    let onScreen = true;
    const pointer = {
      x: -9999,
      y: -9999,
      inside: false
    };
    const SPACING = 13;
    const RADIUS = 1.5;
    function build() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width;
      const h = rect.height;
      const mask = document.createElement("canvas");
      mask.width = Math.max(1, Math.floor(w));
      mask.height = Math.max(1, Math.floor(h));
      const mctx = mask.getContext("2d");
      let sample = null;
      if (mctx) {
        const size = Math.min(w * 0.34, h * 0.92);
        mctx.fillStyle = "#000";
        mctx.font = `700 ${size}px Archivo, system-ui, sans-serif`;
        mctx.textAlign = "center";
        mctx.textBaseline = "middle";
        mctx.fillText("vela", w / 2, h / 2);
        try {
          sample = mctx.getImageData(0, 0, mask.width, mask.height).data;
        } catch {
          sample = null;
        }
      }
      dots = [];
      for (let y = SPACING / 2; y < h; y += SPACING) {
        for (let x = SPACING / 2; x < w; x += SPACING) {
          if (sample) {
            const px = Math.floor(x);
            const py = Math.floor(y);
            const alpha = sample[(py * mask.width + px) * 4 + 3];
            if (alpha > 40) continue;
          }
          dots.push({
            x,
            y,
            level: 0
          });
        }
      }
    }
    function draw() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      let awake = false;
      for (const dot of dots) {
        if (pointer.inside) {
          const d = Math.hypot(dot.x - pointer.x, dot.y - pointer.y);
          const reach = 92;
          if (d < reach) {
            const lift = 1 - d / reach;
            if (lift > dot.level) dot.level = lift;
          }
        }
        if (dot.level > 1e-3) {
          dot.level = reduced ? 0 : dot.level * 0.945;
          awake = true;
        } else {
          dot.level = 0;
        }
        const alpha = 0.14 + dot.level * 0.66;
        ctx.fillStyle = `rgba(236, 228, 214, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, RADIUS + dot.level * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      if ((awake || pointer.inside) && onScreen) {
        raf = requestAnimationFrame(draw);
      } else {
        running = false;
      }
    }
    function wake() {
      if (running || !onScreen) return;
      running = true;
      raf = requestAnimationFrame(draw);
    }
    function pointFrom(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.inside = true;
      wake();
    }
    const onMove = (e) => pointFrom(e);
    const onLeave = () => {
      pointer.inside = false;
      wake();
    };
    const onTouch = (e) => {
      if (e.touches && e.touches.length) {
        pointFrom(e.touches[0]);
      }
    };
    build();
    draw();
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("touchmove", onTouch, {
      passive: true
    });
    canvas.addEventListener("touchstart", onTouch, {
      passive: true
    });
    const onResize = () => {
      build();
      wake();
    };
    window.addEventListener("resize", onResize);
    let observer;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          onScreen = entry.isIntersecting;
          if (onScreen) wake();
        }
      }, {
        threshold: 0
      });
      observer.observe(canvas);
    }
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("touchmove", onTouch);
      canvas.removeEventListener("touchstart", onTouch);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, []);
  return jsx("canvas", {
    ref,
    class: "footer-canvas",
    "aria-hidden": "true"
  });
}

const $$Footer = createComponent(($$result, $$props, $$slots) => {
  const entries = ["Shop", "Support", "Terms", "Privacy", "Jobs", "Contact"];
  return renderTemplate`${maybeRenderHead()}<footer class="footer ground-dark" data-astro-cid-sz7xmlte> <div class="footer-inner" data-astro-cid-sz7xmlte> <div class="field-wrap" data-astro-cid-sz7xmlte> ${renderComponent($$result, "FooterField", FooterField, { "client:visible": true, "client:component-hydration": "visible", "client:component-path": "/app/src/islands/FooterField.jsx", "client:component-export": "default", "data-astro-cid-sz7xmlte": true })} </div> <div class="bottom-row" data-astro-cid-sz7xmlte> <span class="bottom-mark" data-astro-cid-sz7xmlte>${renderComponent($$result, "Wordmark", $$Wordmark, { "size": 18, "data-astro-cid-sz7xmlte": true })}</span> <span class="rights" data-astro-cid-sz7xmlte>All rights reserved</span> <ul class="entries" data-astro-cid-sz7xmlte> ${entries.map((entry) => renderTemplate`<li data-astro-cid-sz7xmlte> ${entry === "Shop" ? renderTemplate`<a href="/shop" data-astro-cid-sz7xmlte>Shop</a>` : renderTemplate`<span data-astro-cid-sz7xmlte>${entry}</span>`} </li>`)} </ul> </div> </div> </footer> `;
}, "/app/src/components/Footer.astro", void 0);

function ScrollDriver() {
  useEffect(() => {
    const stage = document.querySelector("[data-stage]");
    const darken = document.querySelector("[data-darken]");
    const flat = document.querySelector("[data-flat]");
    const driven = Array.from(document.querySelectorAll("[data-driven-para]"));
    if (!stage) return void 0;
    const wide = window.matchMedia("(min-width: 64rem)");
    let ticking = false;
    const apply = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const y = window.scrollY || doc.scrollTop || 0;
      const progress = Math.min(1, Math.max(0, y / max));
      const shade = Math.min(1, progress / 0.75);
      if (darken) darken.style.setProperty("--darken", shade.toFixed(4));
      if (flat) {
        const flatness = Math.min(1, Math.max(0, (progress - 0.72) / 0.18));
        flat.style.setProperty("--flat", flatness.toFixed(4));
      }
      if (!wide.matches) {
        const h = window.innerHeight;
        for (const node of driven) {
          const rect = node.getBoundingClientRect();
          const centre = rect.top + rect.height / 2;
          const distance = Math.abs(centre - h / 2) / (h / 2);
          const opacity = Math.min(1, Math.max(0, 1.35 - distance * 1.35));
          node.style.opacity = opacity.toFixed(3);
        }
      } else {
        for (const node of driven) node.style.opacity = "";
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, {
      passive: true
    });
    window.addEventListener("resize", onScroll, {
      passive: true
    });
    wide.addEventListener?.("change", apply);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      wide.removeEventListener?.("change", apply);
    };
  }, []);
  return null;
}

// The letter is one document: a two word lowercase title, a dateline, sixteen
// paragraphs and a closing line. `side` drives the narrow-viewport layout,
// where each paragraph is a half width block and the blocks alternate in a
// pattern that follows the argument rather than a rule. The three consecutive
// paragraphs about mass market electronics are pulled to one side together.
const TITLE = 'the table';
const DATELINE = 'June 1, 2026';
const CLOSING = 'See you soon.';
const PARAGRAPHS = [{
  side: 'start',
  text: 'This is written at the table where we build the cameras. It is a door on two trestles, and it has been in three rooms in four years. There are burns on it from a soldering iron that has since died, and a rectangle at one end that is cleaner than the rest, because a jig sat there for eleven months.'
}, {
  side: 'end',
  text: 'We make two cameras. One is large and one is small, and they take the same lenses and write the same files. That is the whole line. We have been asked, more than once, when the third is coming, and the answer is that it is not coming until there is a reason for it that we can say out loud in one sentence.'
}, {
  side: 'start',
  text: 'We started because a camera we both liked was discontinued, and the company that made it would not sell us the part that had failed. The part was a flexible cable worth about four dollars. The camera was worth rather more than that, and it went in a drawer, where it still is.'
}, {
  side: 'end',
  text: 'So the first decision was made for us: every part in our cameras has a number, and every number is on our site, and if you want to buy that part we will sell it to you. We will sell it to you in year eight as readily as in year one. There is no clever version of this. It is a spreadsheet and a shelf.'
}, {
  side: 'start',
  text: 'The second decision took longer. We decided the software would be free, and that it would keep working on a machine we no longer sell a camera for. The application is called Arranger. It is not a subscription. It does not have an account. It reads your files off a card and puts them where you tell it to.'
}, {
  side: 'end',
  text: 'The third decision is the one people argue with. The back comes off. Ten screws, a driver you already own, and a diagram we publish. Inside there is a board, a shutter assembly and a sensor module, and all three are replaceable without a jig. It costs us margin and it costs us a certain kind of thinness.'
}, {
  side: 'start',
  text: 'Most of what is sold as consumer electronics is not built this way, and it is worth being precise about why rather than simply disapproving.'
}, {
  side: 'start',
  text: 'A device that cannot be opened is cheaper to assemble, because glue is faster than screws and a robot can apply it. It is cheaper to support, because there is only one repair and it is a replacement. And it is better for the next quarter, because a device that dies at four years is a device that is bought again at four years.'
}, {
  side: 'start',
  text: 'None of that is a conspiracy. It is a series of individually reasonable decisions made by people with targets, and the result is a landfill. We are not better people. We simply have a smaller company and a longer horizon, and that lets us make the other choice.'
}, {
  side: 'end',
  text: 'What that costs you is real, and we would rather state it than let you discover it. Our cameras are heavier than they could be. They are more expensive than a similar sensor in a sealed body. We ship slowly, and when a batch is late it is late by weeks, not days, because there is no second factory to move it to.'
}, {
  side: 'start',
  text: 'What it buys you is that the camera is still a camera in ten years. The firmware is signed and published, and the installer runs in a browser for the case where the application cannot see the camera at all, which happens, usually at the worst time.'
}, {
  side: 'end',
  text: 'We keep a record of every serial number we have made, who it went to if they told us, and what firmware it last reported. That record is yours to move. When you sell a camera you release it, and the next person registers it, and neither of you has to ask us for permission.'
}, {
  side: 'start',
  text: 'People ask what happens if we stop. It is a fair question to ask a company of this size. The answer is that the repair documentation and the firmware images are published under a licence that survives us, and the last thing we would do is put the remaining stock of parts somewhere they can be bought.'
}, {
  side: 'end',
  text: 'We are eleven people. Four of us are on the hardware, three on the software, two on support, and two on everything else, which is mostly boxes and invoices and the phone. The table sits in the middle of a room in a building that used to press sheet metal.'
}, {
  side: 'start',
  text: 'If you write to us, one of those eleven answers. It may take two days. It will not be a form, and it will not ask you to restart the camera unless restarting the camera is genuinely the thing to do.'
}, {
  side: 'end',
  text: 'That is the company. Two cameras, a free application, a shelf of parts and a table with a burn on it. If that sounds like the right way to buy a camera, we would like to build one for you.'
}];

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Vela", "ground": "dark", "description": "A letter from the table where we build the cameras.", "data-astro-cid-j7pv25f6": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<a class="skip-link" href="#letter" data-astro-cid-j7pv25f6>Skip to the letter</a>  ${renderComponent($$result2, "Stage", $$Stage, { "data-astro-cid-j7pv25f6": true })}  <div class="mark-bar" data-astro-cid-j7pv25f6> <a href="/" class="mark-link" aria-label="Vela" data-astro-cid-j7pv25f6> ${renderComponent($$result2, "Wordmark", $$Wordmark, { "size": 40, "data-astro-cid-j7pv25f6": true })} </a> </div> <main id="letter" class="letter" tabindex="-1" data-astro-cid-j7pv25f6> <header class="letter-head" data-astro-cid-j7pv25f6> <h1 class="display" data-astro-cid-j7pv25f6>${TITLE}</h1> <p class="dateline" data-astro-cid-j7pv25f6>${DATELINE}</p> </header> <!-- Normal flow: this is what the markup carries and what a reader with no
         scripting receives, in correct reading order. --> <div class="prose" data-astro-cid-j7pv25f6> ${PARAGRAPHS.map((p) => renderTemplate`<p data-astro-cid-j7pv25f6>${p.text}</p>`)} <!-- The only place the accent appears on this surface. --> <p class="closing" data-astro-cid-j7pv25f6>${CLOSING}</p> </div> </main>  <div class="driven" aria-hidden="true" data-astro-cid-j7pv25f6> ${PARAGRAPHS.map((p) => renderTemplate`<div${addAttribute(["driven-row", p.side], "class:list")} data-astro-cid-j7pv25f6> <p class="driven-para" data-driven-para data-astro-cid-j7pv25f6>${p.text}</p> </div>`)} <div class="driven-row end" data-astro-cid-j7pv25f6> <p class="driven-para closing" data-driven-para data-astro-cid-j7pv25f6>${CLOSING}</p> </div> </div> ${renderComponent($$result2, "ScrollDriver", ScrollDriver, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/app/src/islands/ScrollDriver.jsx", "client:component-export": "default", "data-astro-cid-j7pv25f6": true })} ${renderComponent($$result2, "Footer", $$Footer, { "data-astro-cid-j7pv25f6": true })} ` })}  ${renderScript($$result, "/app/src/pages/index.astro?astro&type=script&index=0&lang.ts")} `;
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
