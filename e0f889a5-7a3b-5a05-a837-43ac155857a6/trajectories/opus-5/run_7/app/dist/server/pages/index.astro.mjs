import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { $ as $$Base } from '../chunks/Base_DrlgOIIb.mjs';
import { useEffect, useRef } from 'preact/hooks';
import { jsx } from 'preact/jsx-runtime';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

function LetterStage() {
  useEffect(() => {
    const page = document.querySelector("[data-letter-page]");
    const stage = document.querySelector("[data-stage]");
    const video = document.querySelector("[data-film]");
    if (!page || !stage) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 63.999rem)");
    const driven = page.querySelector("[data-driven-layer]");
    const drivenParas = driven ? Array.from(driven.querySelectorAll("p")) : [];
    let ticking = false;
    const paint = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / max));
      const darken = Math.min(1, progress / 0.75);
      stage.style.setProperty("--darken", String(darken));
      const flat = darken >= 1 ? Math.min(1, (progress - 0.75) / 0.14) : 0;
      stage.style.setProperty("--flat", String(flat));
      if (narrow.matches && drivenParas.length) {
        const vh = window.innerHeight;
        for (const p of drivenParas) {
          const r = p.getBoundingClientRect();
          const centre = r.top + r.height / 2;
          const d = Math.abs(centre - vh / 2) / (vh * 0.62);
          p.style.setProperty("--p-opacity", String(Math.min(1, Math.max(0.06, 1 - d))));
        }
      }
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(paint);
      }
    };
    const syncDriven = () => {
      page.setAttribute("data-driven", narrow.matches ? "true" : "false");
      paint();
    };
    window.addEventListener("scroll", onScroll, {
      passive: true
    });
    window.addEventListener("resize", syncDriven);
    narrow.addEventListener?.("change", syncDriven);
    syncDriven();
    let observer = null;
    if (video) {
      const conn = navigator.connection || {};
      const metered = Boolean(conn.saveData) || /^([23]g|slow-2g)$/.test(String(conn.effectiveType || ""));
      const allowed = () => !reduced.matches && !metered;
      const tryPlay = () => {
        if (!allowed()) return;
        video.play().then(() => stage.setAttribute("data-playing", "true")).catch(() => {
        });
      };
      if (allowed()) {
        if (video.readyState >= 3) tryPlay();
        else video.addEventListener("canplaythrough", tryPlay, {
          once: true
        });
        video.addEventListener("error", () => {
          stage.setAttribute("data-film-failed", "true");
        });
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) video.pause();
          else if (stage.getAttribute("data-visible") !== "false") tryPlay();
        });
        observer = new IntersectionObserver(([entry]) => {
          stage.setAttribute("data-visible", entry.isIntersecting ? "true" : "false");
          if (!entry.isIntersecting) video.pause();
          else if (!document.hidden) tryPlay();
        }, {
          threshold: 0.01
        });
        observer.observe(stage);
      }
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", syncDriven);
      observer?.disconnect();
    };
  }, []);
  return null;
}

function FooterField() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      canvas.remove();
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const SPACING = 9;
    const WORD = "VELA";
    let dots = [];
    let raf = 0;
    let pointer = {
      x: -9999,
      y: -9999,
      inside: false
    };
    let visible = true;
    let width = 0;
    let height = 0;
    const build = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(320, Math.floor(rect.width));
      height = Math.max(120, Math.round(width * 0.22));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mask = document.createElement("canvas");
      mask.width = width;
      mask.height = height;
      const mctx = mask.getContext("2d");
      if (!mctx) return;
      mctx.fillStyle = "#000";
      mctx.fillRect(0, 0, width, height);
      mctx.fillStyle = "#fff";
      mctx.textAlign = "center";
      mctx.textBaseline = "middle";
      let size = Math.floor(height * 0.92);
      mctx.font = `700 ${size}px "Vela Grotesque", system-ui, sans-serif`;
      while (mctx.measureText(WORD).width > width * 0.86 && size > 12) {
        size -= 2;
        mctx.font = `700 ${size}px "Vela Grotesque", system-ui, sans-serif`;
      }
      mctx.fillText(WORD, width / 2, height / 2);
      const data = mctx.getImageData(0, 0, width, height).data;
      dots = [];
      for (let y = SPACING / 2; y < height; y += SPACING) {
        for (let x = SPACING / 2; x < width; x += SPACING) {
          const i = (Math.floor(y) * width + Math.floor(x)) * 4;
          if (data[i] < 128) dots.push({
            x,
            y,
            level: 0
          });
        }
      }
    };
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      let alive = false;
      for (const d of dots) {
        if (pointer.inside) {
          const dist = Math.hypot(d.x - pointer.x, d.y - pointer.y);
          const reach = 74;
          if (dist < reach) {
            const k = 1 - dist / reach;
            if (k > d.level) d.level = k;
          }
        }
        if (d.level > 0) {
          d.level = reduced.matches ? 0 : Math.max(0, d.level - 0.016);
          if (d.level > 2e-3) alive = true;
        }
        const base = 0.16;
        const a = base + d.level * 0.72;
        const r = 1.15 + d.level * 1.5;
        ctx.beginPath();
        ctx.fillStyle = `rgba(238, 234, 226, ${a.toFixed(3)})`;
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if ((alive || pointer.inside) && visible) raf = requestAnimationFrame(draw);
      else raf = 0;
    };
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(draw);
    };
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      pointer = {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
        inside: true
      };
      kick();
    };
    const onLeave = () => {
      pointer.inside = false;
      kick();
    };
    const onTouch = (e) => {
      const t = e.touches[0];
      if (!t) return;
      const r = canvas.getBoundingClientRect();
      pointer = {
        x: t.clientX - r.left,
        y: t.clientY - r.top,
        inside: true
      };
      kick();
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("touchstart", onTouch, {
      passive: true
    });
    canvas.addEventListener("touchmove", onTouch, {
      passive: true
    });
    canvas.addEventListener("touchend", onLeave, {
      passive: true
    });
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) kick();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }, {
      threshold: 0.01
    });
    io.observe(canvas);
    const onResize = () => {
      build();
      kick();
    };
    window.addEventListener("resize", onResize);
    build();
    draw();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  return jsx("div", {
    class: "footer-canvas-wrap",
    children: jsx("canvas", {
      ref,
      class: "footer-canvas",
      "aria-hidden": "true"
    })
  });
}

// The letter is the subject of the front page. Sixteen paragraphs, a dateline and
// one closing line, which is the only place the accent appears on that surface.

const LETTER_TITLE = 'the table';
const LETTER_DATELINE = 'June 1, 2026';
const LETTER_CLOSING = 'See you soon.';

/**
 * side: which half a paragraph takes below 64rem. The three consecutive
 * paragraphs about mass market electronics are pulled to one side together,
 * because the pattern follows the argument rather than a rule.
 */
const LETTER_PARAGRAPHS = [{
  text: 'This company started at a kitchen table in Portland with two people, a broken camera and a set of jeweller\'s screwdrivers that were the wrong size for every screw in it.',
  side: 'start'
}, {
  text: 'The camera was eleven years old. It had stopped seeing. The shutter fired, the card filled with frames, and every frame was the same flat grey. We had both shot with it for years and neither of us had ever opened one.',
  side: 'end'
}, {
  text: 'It took an afternoon to get the back off. Inside was a ribbon cable that had worked itself loose from a connector, and a service manual we had to find on a forum because the manufacturer had never published one.',
  side: 'start'
}, {
  text: 'We pushed the cable back in. The camera saw again. It is on the shelf above the bench as I write this and it still works.',
  side: 'end'
},
// The three consecutive paragraphs about mass market electronics, together.
{
  text: 'That afternoon is the whole argument for this company, so I want to be exact about what it taught us. It was not that the camera was badly made. It was well made. It was that nobody who made it expected anyone to ever open it.',
  side: 'start'
}, {
  text: 'Mass market electronics are designed around a replacement cycle. The glue is chosen so the seam never shows, not so the seam can be parted. The firmware is signed so it cannot be examined. The service manual is a trade secret. None of this is malice; it is what happens when the person who buys the object is not the person the object is designed for.',
  side: 'start'
}, {
  text: 'The person it is designed for is the next quarter. And a camera designed for the next quarter is a camera that is finished with you in three years, whatever its shutter is rated to.',
  side: 'start'
}, {
  text: 'So we build two cameras. Only two. The A1 is the full-frame body and the Cricket goes in a coat pocket, and between them they are everything we know how to do well.',
  side: 'end'
}, {
  text: 'The shutter in the A1 is rated to four hundred thousand actuations. The battery door is a part you can buy from us for eleven dollars. The sensor assembly comes out with four screws and a Torx driver you probably already own, and the manual that tells you which four is on our site, free, with the rest of them.',
  side: 'start'
}, {
  text: 'We sell directly. There is no distributor and no reseller, which means when something goes wrong you are talking to the people who specified the part that went wrong.',
  side: 'end'
}, {
  text: 'Arranger is the application, it is free, and it stays free. Every release we have ever shipped is in the archive with its notes, including the releases where the notes are mostly things we broke.',
  side: 'start'
}, {
  text: 'The firmware is on the same page. If Arranger cannot see your camera there is a page in this site that writes firmware straight from a browser, and it works on a camera that will not boot far enough to talk to anything else.',
  side: 'end'
}, {
  text: 'A serial number is a real record here. It is not a warranty condition and it is not a marketing list. It is how we know which camera we are talking about when you write to us, and it is yours to hand to somebody else when you sell the camera on.',
  side: 'start'
}, {
  text: 'We will repair a camera that is registered to somebody else, and we will repair one whose warranty ran out four years ago. Ownership and warranty are not conditions of repair. A camera that can be fixed should be fixed.',
  side: 'end'
}, {
  text: 'The Monitor Mount is discontinued. We stopped making it when the monitors it was cut for went out of production, and we will support the ones we sold until September 2029, which is on the page for it in plain language rather than in a footnote.',
  side: 'start'
}, {
  text: 'That is the company. Two cameras, a free application, the whole archive, and a bench in Portland with somebody at it. If you want the long version, the table above is where it all still happens.',
  side: 'end'
}];

const $$Index = createComponent(($$result, $$props, $$slots) => {
  const footerEntries = ["Shop", "Support", "Terms", "Privacy", "Jobs", "Contact"];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Vela \u2014 the table", "description": "A letter from the bench in Portland where Vela builds two cameras.", "ground": "ground-dark" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<a class="skip-link" href="#letter">Skip to the letter</a> <div class="letter-page" data-letter-page> <!-- The stage: film, still, speckle, darkening, flat panel. Nothing else may
         introduce another layer. The film is inert and hidden from assistive
         technology, and dragging on it scrolls the page. --> <div class="stage" data-stage aria-hidden="true"> <div class="stage-fallback"></div> <video class="stage-film" data-film src="/media/table.webm" poster="/media/table-poster.jpg" muted loop playsinline preload="metadata" tabindex="-1" aria-hidden="true"></video> <img class="stage-still" src="/media/table-poster.jpg" alt="" decoding="async"> <div class="stage-speckle"></div> <div class="stage-darken"></div> <div class="stage-flat"></div> </div> <!-- Layer 7: the fixed wordmark, the only navigation on this surface. --> <a class="letter-mark" href="/">vela</a> <article class="letter" id="letter"> <header class="letter-head"> <h1 class="letter-title">${LETTER_TITLE}</h1> <p class="letter-dateline">${LETTER_DATELINE}</p> </header> <!-- Every paragraph exists twice. This is the copy in normal flow: it is
           what the markup carries and what a reader with no scripting receives,
           in correct reading order. --> <div class="letter-body letter-flow"> ${LETTER_PARAGRAPHS.map((p) => renderTemplate`<p${addAttribute(p.side === "end" ? "half-end" : "half-start", "class")}>${p.text}</p>`)} <p class="letter-closing">${LETTER_CLOSING}</p> </div> <!-- The inert layer the scroll drives, hidden from assistive technology.
           It is never the only copy. --> <div class="letter-body letter-driven" data-driven-layer aria-hidden="true" inert> ${LETTER_PARAGRAPHS.map((p) => renderTemplate`<p${addAttribute(p.side === "end" ? "half-end" : "half-start", "class")}>${p.text}</p>`)} <p class="letter-closing">${LETTER_CLOSING}</p> </div> </article> <footer class="letter-footer ground-dark"> ${renderComponent($$result2, "FooterField", FooterField, { "client:idle": true, "client:component-hydration": "idle", "client:component-path": "/app/src/islands/FooterField.jsx", "client:component-export": "default" })} <div class="footer-bottom"> <span class="wordmark wordmark-sm">vela</span> <span class="footer-rights">All rights reserved</span> <ul class="footer-links"> ${footerEntries.map((entry) => renderTemplate`<li> ${entry === "Shop" ? renderTemplate`<a href="/shop">Shop</a>` : renderTemplate`<span>${entry}</span>`} </li>`)} </ul> </div> </footer> </div> ${renderComponent($$result2, "LetterStage", LetterStage, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/app/src/islands/LetterStage.jsx", "client:component-export": "default" })} ` })}`;
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
