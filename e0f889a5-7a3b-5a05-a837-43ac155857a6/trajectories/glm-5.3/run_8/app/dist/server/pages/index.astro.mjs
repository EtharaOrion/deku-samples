import { c as createComponent, e as renderHead, d as renderComponent, a as addAttribute, r as renderTemplate } from "../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
/* empty css                                    */
import { useRef, useEffect } from "preact/hooks";
import { jsxs, Fragment, jsx } from "preact/jsx-runtime";
/* empty css                                 */
import { renderers } from "../renderers.mjs";
function LetterStage({
  paragraphs = [],
  sides = []
}) {
  const stageRef = useRef(null);
  const veilRef = useRef(null);
  const flatRef = useRef(null);
  const drivenRef = useRef(null);
  const videoRef = useRef(null);
  const speckleRef = useRef(null);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wideMq = window.matchMedia("(min-width: 64rem)");
    const veil = veilRef.current;
    const flat = flatRef.current;
    const driven = drivenRef.current;
    const video = videoRef.current;
    const stage = stageRef.current;
    const layOut = () => {
      if (!driven) return;
      const showDriven = !wideMq.matches && !reduced;
      driven.style.display = showDriven ? "block" : "none";
      const letter = document.getElementById("letter");
      if (!letter) return;
      const letterBox = letter.getBoundingClientRect();
      const letterTop = letterBox.top + window.scrollY;
      driven.style.top = "0px";
      driven.style.height = letter.offsetHeight + "px";
      if (!showDriven) return;
      driven.querySelectorAll("[data-para]").forEach((el) => {
        const i = el.getAttribute("data-para");
        const flow = letter.querySelector('.letter-flow p[data-index="' + i + '"]');
        if (!flow) return;
        const box = flow.getBoundingClientRect();
        el.style.top = box.top + window.scrollY - letterTop + "px";
        el.style.height = flow.offsetHeight + "px";
        el.textContent = flow.textContent;
      });
    };
    const applyScroll = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const p = Math.min(1, Math.max(0, window.scrollY / max));
      if (veil) veil.style.opacity = String(p);
      if (flat) flat.style.opacity = p >= 0.999 ? "1" : "0";
      if (!wideMq.matches && !reduced && driven) {
        const vh = window.innerHeight;
        driven.querySelectorAll("[data-para]").forEach((el) => {
          const r = el.getBoundingClientRect();
          const centre = r.top + r.height / 2;
          const d = 1 - Math.min(1, Math.abs(centre - vh * 0.55) / (vh * 0.7));
          el.style.opacity = String(Math.max(0.05, d));
        });
      } else if (driven) {
        driven.querySelectorAll("[data-para]").forEach((el) => {
          el.style.opacity = "";
        });
      }
    };
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        applyScroll();
      });
    };
    layOut();
    applyScroll();
    window.addEventListener("scroll", onScroll, {
      passive: true
    });
    window.addEventListener("resize", () => {
      layOut();
      onScroll();
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
      layOut();
      onScroll();
    });
    setTimeout(() => {
      layOut();
      onScroll();
    }, 300);
    const wideChange = () => applyScroll();
    wideMq.addEventListener("change", wideChange);
    let filmStarted = false;
    const tryStart = () => {
      if (filmStarted || !video || reduced) return;
      const conn = navigator.connection;
      if (conn && (conn.saveData || /-\d$/.test(conn.effectiveType || "") || conn.type === "cellular")) return;
      if (document.hidden) return;
      if (stage && stage.getBoundingClientRect().bottom < 0) return;
      if (video.readyState < 2) return;
      filmStarted = true;
      video.style.opacity = "1";
      const p = video.play();
      if (p && p.catch) p.catch(() => {
        filmStarted = false;
        video.style.opacity = "0";
      });
    };
    if (video) {
      fetch("/film.mp4", {
        headers: {
          Range: "bytes=0-0"
        }
      }).then((r) => {
        const cr = r.headers.get("content-range") || "";
        const total = Number((cr.split("/")[1] || "0").replace(/[^0-9]/g, ""));
        const len = total || Number(r.headers.get("content-length") || "0");
        if (r.ok && len > 1e3) {
          video.src = "/film.mp4";
          video.load();
        }
      }).catch(() => {
      });
      video.addEventListener("loadeddata", tryStart);
      document.addEventListener("visibilitychange", () => {
        if (!video) return;
        if (document.hidden) video.pause();
        else if (filmStarted) {
          const p = video.play();
          if (p && p.catch) p.catch(() => {
          });
        }
      });
    }
    const canvas = speckleRef.current;
    let speckleRaf = null;
    const drawSpeckle = () => {
      if (!canvas) return;
      const ctx = canvas.getContext && canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width = Math.min(320, window.innerWidth / 4);
      const h = canvas.height = Math.min(180, window.innerHeight / 4);
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (Math.random() * 18 - 9);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 14;
      }
      ctx.putImageData(img, 0, 0);
    };
    drawSpeckle();
    const speckleTick = () => {
      if (reduced) return;
      if (stage && stage.getBoundingClientRect().bottom > 0 && !document.hidden) drawSpeckle();
      speckleRaf = setTimeout(speckleTick, 180);
    };
    if (!reduced) speckleTick();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      wideMq.removeEventListener("change", wideChange);
      if (speckleRaf) clearTimeout(speckleRaf);
    };
  }, []);
  return jsxs(Fragment, {
    children: [jsxs("div", {
      class: "stage",
      ref: stageRef,
      "aria-hidden": "true",
      children: [jsx("video", {
        ref: videoRef,
        class: "stage-film",
        muted: true,
        playsinline: true,
        autoplay: false,
        loop: true,
        preload: "none",
        tabindex: "-1",
        poster: "/film-still.svg"
      }), jsx("img", {
        class: "stage-still",
        src: "/film-still.svg",
        alt: "",
        ref: null
      }), jsx("canvas", {
        class: "stage-speckle",
        ref: speckleRef
      }), jsx("div", {
        class: "stage-veil",
        ref: veilRef
      }), jsx("div", {
        class: "stage-flat",
        ref: flatRef
      })]
    }), jsx("div", {
      class: "stage-driven",
      ref: drivenRef,
      "aria-hidden": "true",
      children: paragraphs.map((p) => jsx("p", {
        "data-para": p.i,
        "data-side": sides[p.i] || "left",
        children: p.text
      }))
    })]
  });
}
function FooterCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dots = [];
    let w = 0, h = 0, dpr = 1;
    const GLYPHS = {
      V: ["1010", "1010", "1010", "1010", "0101", "0101", "0010"],
      E: ["1111", "1000", "1110", "1000", "1000", "1000", "1111"],
      L: ["1000", "1000", "1000", "1000", "1000", "1000", "1111"],
      A: ["0010", "0101", "0101", "1111", "1010", "1010", "1010"]
    };
    const word = "VELA";
    const cols = 60, cell = 16, pad = 8;
    const glyphH = 7;
    const layout = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      w = Math.max(320, rect.width);
      dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.style.width = w + "px";
      const rows = glyphH + 6;
      h = rows * cell + pad * 2;
      canvas.height = h * dpr;
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      const scale = Math.max(1, Math.floor(w / (cols * cell)));
      const gw = word.length * 5 * scale;
      const gx = Math.round((w - gw) / 2);
      const gy = pad;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let omitted = false;
          const inGx = c * cell >= gx - cell && c * cell < gx + gw + cell;
          if (inGx && r >= gy / cell && r < gy / cell + glyphH) {
            const glyphIdx = Math.floor((c * cell - gx) / (5 * scale));
            const g = GLYPHS[word[glyphIdx]] || GLYPHS.V;
            const colInGlyph = Math.floor((c * cell - gx) % (5 * scale) / scale);
            const rowInGlyph = r - Math.floor(gy / cell);
            if (g[rowInGlyph] && g[rowInGlyph][colInGlyph] === "1") omitted = true;
          }
          dots.push({
            x: c * cell + cell / 2,
            y: r * cell + cell / 2 + pad,
            v: 0,
            rest: omitted ? 0.16 : 0.5
          });
        }
      }
    };
    layout();
    const onResize = () => layout();
    window.addEventListener("resize", onResize);
    let pointer = null;
    let raf = null;
    let last = performance.now();
    let anyAwake = false;
    const restDot = (d) => d.rest;
    const step = (now) => {
      const dt = Math.min(100, now - last);
      last = now;
      anyAwake = false;
      for (const d of dots) {
        if (pointer) {
          const dist = Math.hypot(d.x - pointer.x, d.y - pointer.y);
          if (dist < 120) {
            const boost = (1 - dist / 120) * 0.9;
            if (boost > d.v) d.v = boost;
          }
        }
        if (d.v > 2e-3) {
          d.v -= reduced ? d.v : dt / 1e3 * 0.85;
          if (d.v < 0) d.v = 0;
        }
        if (d.v > 2e-3) anyAwake = true;
      }
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        const a = restDot(d) + d.v * 0.6;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(242,240,234,${Math.min(1, a).toFixed(3)})`;
        ctx.fill();
      }
      if (anyAwake || pointer) raf = requestAnimationFrame(step);
      else raf = null;
    };
    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      pointer = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(step);
      }
    };
    const onLeave = () => {
      pointer = null;
      if (!raf) {
        raf = requestAnimationFrame(step);
      }
    };
    let io = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver((entries) => {
        canvas.dataset.visible = entries[0].isIntersecting ? "1" : "0";
      });
      io.observe(canvas);
    } else {
      canvas.dataset.visible = "1";
    }
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onMove);
    raf = requestAnimationFrame(step);
    return () => {
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onMove);
      if (io) io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return jsx("canvas", {
    class: "footer-canvas",
    ref,
    "aria-hidden": "true"
  });
}
const $$Index = createComponent(($$result, $$props, $$slots) => {
  const paragraphs = [
    "We started Vela at a table like this one. It was second-hand when we got it and it is worse now. There is a vice on the left corner that we have never used and cannot bring ourselves to remove.",
    "The company makes two cameras. That is the whole plan. One is the size of a folded hand. The other is the size of an open one. Both take the same pictures, because both carry the same sensor and the same patience.",
    "We did not set out to build a small camera. We set out to build a camera that would still be taking pictures in fifteen years, and every decision after that made it smaller.",
    "The mass market electronics trade has a habit we do not like. It ships a thing, supports it for the length of a contract, and then asks you to buy the thing again. We think a camera should outlive the order that bought it.",
    "The mass market trade also decides what you may repair. It glues what should be screwed. It writes firmware that only its own cable can speak to. We screw what should be screwed and we publish the cable's language.",
    "So the software that runs inside the camera is yours to write, whenever you want, with the tool on this site. There is no gate, no account and no permission slip. If the tool cannot see your camera, the site can do it too.",
    "We build the bodies in a shop we can walk to. The aluminium comes from a mill two hours east. The assembly is done by eleven people whose names are in the box, on the card, in the order they joined.",
    "The margin on a Vela is thin and we like it that way. It means the camera has to be good enough that you tell someone about it. We do not advertise. You are the advertising, if we have earned it.",
    "Every camera carries a serial we can read back to the day and the week it was cut. When you register it, the link is between you and that serial. It is not a subscription, it is a record, and you can end it.",
    "We will support the A1 until June 2032. Not the batteries, not the strap, the camera. The firmware will keep receiving the same care the hardware does, for as long as the parts exist to test it on.",
    "There is a case, a cable and a mount in the shop because people asked for them. There is nothing else. If a thing does not make the camera better, we do not sell it, even when it would sell.",
    "The workshop table in the film behind these words is the real one. The ring on the right is from a clamp we removed in 2024. We left the mark because the table earned it.",
    "If you have read this far, you are the person we built the camera for. Someone who reads the letter before the price.",
    "The shop is at the bottom of the page, in the footer, where a footer link belongs. There is no countdown, no bundle, no timer. The cameras are made in the order they are bought.",
    "Arranger, the application, is free for anyone, buyer or not. It runs on any Mac from the last five years. The archive of its release notes goes back to the first build, because software should keep its own record.",
    "Thank you for reading to the last line of a letter from a camera company. It is longer than our return policy and better written."
  ];
  const wide = paragraphs.map((text, i) => ({ text, i }));
  const narrowSide = (i) => {
    if (i >= 3 && i <= 5) return "left";
    const others = [0, 1, 2, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const pos = others.indexOf(i);
    return pos % 2 === 0 ? "right" : "left";
  };
  return renderTemplate`<html lang="en" data-astro-cid-j7pv25f6> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>the table — Vela</title>${renderHead()}</head> <body class="surface-dark letter-body" data-astro-cid-j7pv25f6> <a class="skip" href="#letter" data-astro-cid-j7pv25f6>Skip to the letter</a> ${renderComponent($$result, "LetterStage", LetterStage, { "client:visible": true, "paragraphs": wide, "sides": paragraphs.map((_, i) => narrowSide(i)), "client:component-hydration": "visible", "client:component-path": "@components/LetterStage.jsx", "client:component-export": "default", "data-astro-cid-j7pv25f6": true })} <div class="letter-frame" data-astro-cid-j7pv25f6> <a class="wordmark" href="/" aria-label="Vela" data-astro-cid-j7pv25f6>vela</a> <article id="letter" class="letter" data-astro-cid-j7pv25f6> <h1 class="letter-title" data-astro-cid-j7pv25f6>the table</h1> <p class="dateline mono" data-astro-cid-j7pv25f6>June 1, 2026</p> <div class="letter-flow" data-astro-cid-j7pv25f6> ${paragraphs.map((text, i) => renderTemplate`<p class="letter-p"${addAttribute(i, "data-index")} data-astro-cid-j7pv25f6>${text}</p>`)} <p class="letter-closing" data-astro-cid-j7pv25f6>See you soon.</p> </div> </article> </div> <footer class="letter-footer" aria-label="Site footer" data-astro-cid-j7pv25f6> ${renderComponent($$result, "FooterCanvas", FooterCanvas, { "client:visible": true, "client:component-hydration": "visible", "client:component-path": "@components/FooterCanvas.jsx", "client:component-export": "default", "data-astro-cid-j7pv25f6": true })} <div class="footer-bottom" data-astro-cid-j7pv25f6> <span class="wordmark-small" data-astro-cid-j7pv25f6>vela</span> <span class="footer-note" data-astro-cid-j7pv25f6>All rights reserved</span> <nav class="footer-links" aria-label="Footer" data-astro-cid-j7pv25f6> <a href="/shop" data-astro-cid-j7pv25f6>Shop</a> <span data-astro-cid-j7pv25f6>Support</span> <span data-astro-cid-j7pv25f6>Terms</span> <span data-astro-cid-j7pv25f6>Privacy</span> <span data-astro-cid-j7pv25f6>Jobs</span> <span data-astro-cid-j7pv25f6>Contact</span> </nav> </div> </footer>   </body></html>`;
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
