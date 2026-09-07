import { e as createComponent, m as maybeRenderHead, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Base } from '../chunks/Base_CnCPTmfg.mjs';
import { useRef, useEffect, useState } from 'preact/hooks';
import { jsx, jsxs } from 'preact/jsx-runtime';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

function FooterField() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return void 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return void 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let dots = [];
    let raf = 0;
    let running = false;
    let onScreen = false;
    const pointer = {
      x: -9999,
      y: -9999,
      present: false
    };
    const build = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d");
      let mask = null;
      if (octx) {
        octx.fillStyle = "#000";
        octx.fillRect(0, 0, w, h);
        const size = Math.min(h * 0.72, w * 0.26);
        octx.font = `700 ${size}px 'Vela Grotesque', system-ui, sans-serif`;
        octx.textAlign = "center";
        octx.textBaseline = "middle";
        octx.fillStyle = "#fff";
        octx.fillText("VELA", w / 2, h / 2);
        mask = octx.getImageData(0, 0, w, h).data;
      }
      const gap = 9;
      const next = [];
      for (let y = gap; y < h - 2; y += gap) {
        for (let x = gap; x < w - 2; x += gap) {
          if (mask) {
            const idx = (Math.floor(y) * w + Math.floor(x)) * 4;
            if (mask[idx] > 128) continue;
          }
          next.push({
            x,
            y,
            level: 0
          });
        }
      }
      dots = next;
    };
    const draw = () => {
      raf = 0;
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      const styles = getComputedStyle(canvas);
      const base = styles.getPropertyValue("--dot-rest").trim() || "rgba(160,155,146,0.34)";
      const lit = styles.getPropertyValue("--dot-lit").trim() || "rgba(244,242,236,0.95)";
      let awake = false;
      for (const dot of dots) {
        if (pointer.present) {
          const dx = dot.x - pointer.x;
          const dy = dot.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          const reach = 120;
          const gain = dist < reach ? (1 - dist / reach) ** 1.6 : 0;
          if (gain > dot.level) dot.level = gain;
        }
        if (dot.level > 3e-3) {
          dot.level = reduced ? 0 : dot.level * 0.955;
          awake = true;
        } else {
          dot.level = 0;
        }
        ctx.fillStyle = dot.level > 0.01 ? mix(base, lit, dot.level) : base;
        const r = 1.15 + dot.level * 1.5;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (onScreen && (awake || pointer.present)) {
        raf = requestAnimationFrame(draw);
        running = true;
      } else {
        running = false;
      }
    };
    const kick = () => {
      if (!running && onScreen && !raf) {
        raf = requestAnimationFrame(draw);
        running = true;
      }
    };
    const move = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const point = ev.touches?.[0] ?? ev;
      pointer.x = point.clientX - rect.left;
      pointer.y = point.clientY - rect.top;
      pointer.present = true;
      kick();
    };
    const leave = () => {
      pointer.present = false;
      pointer.x = -9999;
      pointer.y = -9999;
      kick();
    };
    build();
    draw();
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) kick();
    }, {
      threshold: 0.01
    });
    io.observe(canvas);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("touchmove", move, {
      passive: true
    });
    canvas.addEventListener("touchstart", move, {
      passive: true
    });
    canvas.addEventListener("touchend", leave);
    const onResize = () => {
      build();
      kick();
    };
    window.addEventListener("resize", onResize);
    return () => {
      io.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchstart", move);
      canvas.removeEventListener("touchend", leave);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return jsx("canvas", {
    ref,
    class: "footer__canvas",
    "aria-hidden": "true"
  });
}
function mix(a, b, t) {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return b;
  const out = pa.map((v, i) => i < 3 ? Math.round(v + (pb[i] - v) * t) : +(v + (pb[i] - v) * t).toFixed(3));
  return `rgba(${out[0]},${out[1]},${out[2]},${out[3]})`;
}
function parse(colour) {
  const m = /rgba?\(([^)]+)\)/.exec(colour);
  if (!m) return null;
  const parts = m[1].split(",").map((v) => parseFloat(v.trim()));
  if (parts.length === 3) parts.push(1);
  return parts;
}

const $$Footer = createComponent(($$result, $$props, $$slots) => {
  const entries = ["Shop", "Support", "Terms", "Privacy", "Jobs", "Contact"];
  return renderTemplate`${maybeRenderHead()}<footer class="footer" data-ground="dark" data-astro-cid-sz7xmlte> ${renderComponent($$result, "FooterField", FooterField, { "client:visible": true, "client:component-hydration": "visible", "client:component-path": "/app/src/islands/FooterField.jsx", "client:component-export": "default", "data-astro-cid-sz7xmlte": true })} <div class="footer__bottom" data-astro-cid-sz7xmlte> <span class="footer__wordmark" data-astro-cid-sz7xmlte>Vela</span> <span class="footer__rights" data-astro-cid-sz7xmlte>All rights reserved</span> <ul class="footer__links" role="list" data-astro-cid-sz7xmlte> ${entries.map(
    (entry) => entry === "Shop" ? renderTemplate`<li data-astro-cid-sz7xmlte> <a class="footer__link" href="/shop" data-astro-cid-sz7xmlte>
Shop
</a> </li>` : renderTemplate`<li data-astro-cid-sz7xmlte> <span class="footer__link footer__link--plain" data-astro-cid-sz7xmlte>${entry}</span> </li>`
  )} </ul> </div> </footer> `;
}, "/app/src/components/Footer.astro", void 0);

function LetterStage({
  paragraphs = [],
  pulled = []
}) {
  const [progress, setProgress] = useState(0);
  const [playFilm, setPlayFilm] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [filmReady, setFilmReady] = useState(false);
  const videoRef = useRef(null);
  const reduced = useRef(false);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY || window.pageYOffset || 0;
      setProgress(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, {
      passive: true
    });
    window.addEventListener("resize", onScroll, {
      passive: true
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const conn = navigator.connection || {};
    const metered = Boolean(conn.saveData) || /^([23]g|slow-2g)$/.test(conn.effectiveType || "");
    const decide = () => {
      reduced.current = mq.matches;
      setPlayFilm(!mq.matches && !metered);
    };
    decide();
    mq.addEventListener?.("change", decide);
    return () => mq.removeEventListener?.("change", decide);
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playFilm) return;
    let onScreen = true;
    const sync = () => {
      if (!videoRef.current) return;
      if (onScreen && !document.hidden) videoRef.current.play?.().catch(() => {
      });
      else videoRef.current.pause?.();
    };
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    }, {
      threshold: 0.01
    });
    io.observe(video);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [playFilm]);
  const veil = Math.min(1, progress * 1.18);
  const flat = progress > 0.92 ? Math.min(1, (progress - 0.92) / 0.08) : 0;
  return jsxs("div", {
    class: "stage",
    "aria-hidden": "true",
    "data-progress": progress.toFixed(3),
    children: [jsx("div", {
      class: "stage__ground"
    }), playFilm && jsx("video", {
      ref: videoRef,
      class: "stage__film",
      src: "/media/workshop-table.webm",
      poster: "/media/workshop-table-poster.jpg",
      muted: true,
      playsInline: true,
      loop: true,
      preload: "metadata",
      tabIndex: -1,
      "aria-hidden": "true",
      onCanPlay: () => setFilmReady(true),
      onError: () => setPlayFilm(false)
    }), !posterFailed ? jsx("img", {
      class: "stage__poster",
      src: "/media/workshop-table-poster.jpg",
      alt: "",
      "aria-hidden": "true",
      decoding: "async",
      style: {
        opacity: filmReady && playFilm ? 0 : 1
      },
      onError: () => setPosterFailed(true)
    }) : jsx("div", {
      class: "stage__fallback"
    }), jsx("div", {
      class: "stage__speckle"
    }), jsx("div", {
      class: "stage__veil",
      style: {
        opacity: veil
      }
    }), jsx("div", {
      class: "stage__flat",
      style: {
        opacity: flat
      }
    })]
  });
}

function LetterDriven({
  paragraphs = [],
  sides = [],
  closing = ""
}) {
  const [wide, setWide] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  useEffect(() => {
    if (wide) return void 0;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setTick((n) => n + 1);
      });
    };
    window.addEventListener("scroll", onScroll, {
      passive: true
    });
    window.addEventListener("resize", onScroll, {
      passive: true
    });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [wide]);
  return jsxs("div", {
    class: `driven ${wide ? "driven--column" : "driven--blocks"}`,
    "aria-hidden": "true",
    children: [paragraphs.map((text, i) => jsx(DrivenParagraph, {
      text,
      side: sides[i] || "left",
      wide,
      tick
    }, i)), jsx("p", {
      class: "letter__closing driven__closing",
      children: closing
    })]
  });
}
function DrivenParagraph({
  text,
  side,
  wide,
  tick
}) {
  const [node, setNode] = useState(null);
  let opacity = 1;
  if (!wide && node) {
    const rect = node.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const centre = rect.top + rect.height / 2;
    const distance = Math.abs(centre - vh / 2) / (vh / 2);
    opacity = Math.max(0.06, Math.min(1, 1.35 - distance * 1.35));
  }
  return jsx("p", {
    ref: setNode,
    class: `driven__p driven__p--${side}`,
    style: wide ? void 0 : {
      opacity
    },
    "data-tick": tick,
    children: text
  });
}

const $$Index = createComponent(($$result, $$props, $$slots) => {
  const paragraphs = [
    "This is the table the cameras are made on. It is in a room above a tyre shop, it is too small for the number of people now standing around it, and everything we sell has been on it at some point with its back off.",
    "We started because the camera one of us wanted did not exist. Not a better sensor, not more frames a second. A camera with one dial that does one thing, a menu that stays where it was left, and a shutter you can feel through a glove.",
    "The first Cricket took nineteen months. Fourteen of those were the shutter. We had a working body in the fifth month and spent the rest of that year deciding it was not good enough, which is not a story that shortens well.",
    "We build in small runs, and each run tells us what the last one got wrong. The A1 you can buy today is the fourth version of a body that has never changed shape. Only the parts inside it that were annoying.",
    "A camera is not a phone. It should not be replaced every two years, and it should not stop working because a company decided it was finished with it. We publish the firmware for every body we have ever sold, and we sell the parts.",
    "The industry we sit in the middle of does not agree. A large maker will build a body for eighteen months, support it for three years, and then remove the drivers from its own website.",
    "It sells the replacement on the strength of a number that was already high enough on the model before it, and it calls the pattern progress, because the alternative is admitting the camera it sold you was finished when it left the factory.",
    "We are not going to fix that, and we are not pretending we can. We can only be one small company that does not do it, and put the release notes for a five year old body where anyone can read them.",
    "So the software here is free and stays free. Arranger reads both bodies, it opens a folder of forty thousand frames without a wait, and it does not have an account, a cloud, or a subscription anywhere inside it.",
    "When a camera stops talking to Arranger, there is a page on this site that writes firmware from the browser. It is the last thing anyone should need and it is the first thing we made sure worked.",
    "We repair a camera whether or not it is in warranty, and whether or not the person holding it is the person who bought it. A serial number is a camera. It is not a receipt, and it is not a customer.",
    "That has a practical consequence we like: cameras get sold on. A Cricket bought here in the first run has had three owners that we know about, and it is still on the current firmware.",
    "We do not have a shop floor, a sales team, or a marketing department. There are nine of us. Two of us answer the mail, and both of them also build cameras, which is the only reason the answers are any use.",
    "What we sell fits on one page, and it will stay that way. Two bodies. A case, a mount we no longer make, and the cable that goes missing first. If a thing does not earn a place on the table, it does not go on the table.",
    "The mount is the honest example. We stopped building it, we did not pretend it never existed, and we will hold parts for it until September 2029. That date is on the product page, which is where it belongs.",
    "If you buy one of these, it will arrive in a box with your serial number written inside the lid, and it will have been switched on by hand, at this table, before it was sealed."
  ];
  const sides = [
    "left",
    "right",
    "left",
    "right",
    "left",
    "right",
    "right",
    "right",
    "left",
    "right",
    "left",
    "right",
    "left",
    "right",
    "left",
    "right"
  ];
  const closing = "See you soon.";
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "the table \u2014 Vela Electronics", "description": "A letter from the table the cameras are made on.", "ground": "dark", "bodyClass": "letter-body" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "LetterStage", LetterStage, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/app/src/islands/LetterStage.jsx", "client:component-export": "default" })}  ${maybeRenderHead()}<div class="letter-mark"> <span class="wordmark">Vela</span> </div> <main id="main" class="letter" data-ground="dark"> <h1 class="letter__title">the table</h1> <p class="letter__dateline"><time datetime="2026-06-01">June 1, 2026</time></p> <!-- The normal-flow copy: what the markup carries and what a reader with no
         scripting receives, in correct reading order. --> <div class="letter__flow"> ${paragraphs.map((text) => renderTemplate`<p class="letter__p">${text}</p>`)} <p class="letter__closing">${closing}</p> </div> </main>  ${renderComponent($$result2, "LetterDriven", LetterDriven, { "client:load": true, "paragraphs": paragraphs, "sides": sides, "closing": closing, "client:component-hydration": "load", "client:component-path": "/app/src/islands/LetterDriven.jsx", "client:component-export": "default" })} ${renderComponent($$result2, "Footer", $$Footer, {})} ` })} `;
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
