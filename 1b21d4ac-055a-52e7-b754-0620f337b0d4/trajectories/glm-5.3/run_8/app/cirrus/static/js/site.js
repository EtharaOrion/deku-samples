/* =============================================================================
   Cirrus — the rendered document's behaviour and nothing else.

   One persistent frame, one scroll source, one cursor pair, one counter well.
   Everything the server put in the document is read from the document; nothing
   here decides who may see a record.
   ========================================================================== */
(() => {
  "use strict";

  const doc = document;
  const html = doc.documentElement;
  const reduced = () => html.classList.contains("reduced");
  const coarse = () => matchMedia("(pointer: coarse)").matches;

  /* ------------------------------------------------------------- utilities */

  const $ = (sel, root) => (root || doc).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || doc).querySelectorAll(sel));

  function setGround(kind) {
    html.dataset.ground = kind === "dark" ? "dark" : "light";
  }

  /* --------------------------------------------------- smooth soft scroll */

  const scroll = {
    y: window.scrollY,
    target: window.scrollY,
    inFlight: false,
    listeners: [],
    raf: null,
  };

  function notify() {
    for (const fn of scroll.listeners) fn(scroll.y);
  }

  function step() {
    const delta = scroll.target - scroll.y;
    if (Math.abs(delta) < 0.5) {
      scroll.y = scroll.target;
      if (scroll.inFlight) {
        scroll.inFlight = false;
        html.classList.remove("is-scrolling");
        notify();
      }
      scroll.raf = null;
      return;
    }
    scroll.y += delta * 0.12;
    notify();
    scroll.raf = requestAnimationFrame(step);
  }

  let nativeCause = false;
  function onNativeScroll() {
    // keyboard, anchor and find-in-page scrolling stay native: only wheel and
    // trackpad input is smoothed.
    if (nativeCause || reduced()) {
      scroll.y = scroll.target = window.scrollY;
      notify();
      return;
    }
    scroll.target = window.scrollY;
    scroll.inFlight = true;
    html.classList.add("is-scrolling");
    if (!scroll.raf) scroll.raf = requestAnimationFrame(step);
  }

  window.addEventListener(
    "keydown",
    () => {
      nativeCause = true;
    },
    { capture: true }
  );
  window.addEventListener("wheel", () => (nativeCause = false), { capture: true, passive: true });

  /* -------------------------------------------------- the persistent frame */

  const frame = $("#frame");
  const markSlot = $(".mark-slot");
  const MARKS = {
    entry: `<svg viewBox="0 0 41 18" width="41" height="18" focusable="false" aria-hidden="true"><ellipse class="strokeonly" cx="20.5" cy="9" rx="19.75" ry="8.25" stroke-width="1.5" fill="none"/></svg>`,
    works: `<svg viewBox="0 0 14 18" width="14" height="18" focusable="false" aria-hidden="true"><rect x="0" y="0" width="4" height="18"/><rect x="5" y="0" width="4" height="11"/><rect x="10" y="0" width="4" height="18"/></svg>`,
    talents: `<svg viewBox="0 0 18 18" width="18" height="18" focusable="false" aria-hidden="true"><path fill-rule="evenodd" d="M9 0a9 9 0 1 0 0 18A9 9 0 0 0 9 0Zm0 2a7 7 0 1 1 0 14A7 7 0 0 1 9 2Zm0 3.2 4 3.8-4 3.8L5 9l4-3.8Z"/></svg>`,
    about: `<svg viewBox="0 0 27 18" width="27" height="18" focusable="false" aria-hidden="true"><circle cx="9" cy="9" r="7.4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="9" r="7.4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="9" r="2.4"/><circle cx="18" cy="9" r="2.4"/></svg>`,
  };

  function markFor(route) {
    if (route === "works" || route === "work") return MARKS.works;
    if (route === "talents" || route === "talent") return MARKS.talents;
    if (route === "about") return MARKS.about;
    return MARKS.entry;
  }

  function setMark(route) {
    if (!markSlot) return;
    markSlot.dataset.mark = route;
    markSlot.innerHTML = markFor(route);
    html.dataset.mark = route;
  }


  function setActiveNav(route) {
    $$(".nav a").forEach((a) => {
      const p = a.getAttribute("href") || "";
      const active =
        ((route === "works" || route === "work") && p === "/works") ||
        ((route === "talents" || route === "talent") && p === "/talents") ||
        (route === "about" && p === "/about");
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
      if (a.parentElement) a.parentElement.classList.toggle("is-active", !!active);
    });
  }

  /* --------------------------------------------- soft navigation: SPA-lite */

  let navigating = false;

  function parseRouteFrom(pathname) {
    if (pathname === "/" || pathname === "") return "entry";
    if (pathname === "/works" || pathname === "/works/") return "works";
    if (pathname.startsWith("/works/")) return "work";
    if (pathname === "/talents" || pathname === "/talents/") return "talents";
    if (pathname.startsWith("/talents/")) return "talent";
    if (pathname.startsWith("/about")) return "about";
    if (pathname.startsWith("/studio")) return "studio";
    return null;
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function navigate(href) {
    if (navigating) return;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname.startsWith("/studio")) return; // studio keeps full loads
    const target = url.pathname + url.search;
    if (target === location.pathname + location.search) return;

    navigating = true;
    const well = $("#content");
    const footer = $("#footer");
    if (frame) frame.classList.add("is-out");
    if (well) well.classList.add("is-out");
    if (footer) footer.classList.add("is-out");

    const fade = reduced() ? 0 : 400;
    await wait(fade);
    let text = "";
    try {
      const resp = await fetch(target, { headers: { "X-Cirrus-Soft": "1" } });
      text = await resp.text();
    } catch (err) {
      location.href = href;
      return;
    }
    const docNew = new DOMParser().parseFromString(text, "text/html");
    const newWell = $("#content", docNew);
    if (newWell && well) well.replaceWith(newWell.cloneNode(true));
    const newFooter = $("#footer", docNew);
    if (newFooter && footer) footer.replaceWith(newFooter.cloneNode(true));

    const routeKey = docNew.body.dataset.route || parseRouteFrom(url.pathname) || "entry";
    setMark(routeKey);
    setActiveNav(routeKey);
    setGround(routeKey === "entry" ? "dark" : "light");
    document.title = docNew.title;
    history.pushState({}, "", target);

    teardownRoute();
    window.scrollTo(0, 0);
    scroll.y = scroll.target = 0;
    bootRoute(docNew.body.dataset.route, url.pathname);

    if (frame) frame.classList.remove("is-out");
    const w2 = $("#content");
    if (w2) w2.classList.remove("is-out");
    const f2 = $("#footer");
    if (f2) f2.classList.remove("is-out");
    navigating = false;
  }

  doc.addEventListener(
    "click",
    (ev) => {
      if (ev.defaultPrevented || ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = ev.target.closest("a[href]");
      if (!a) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) return;
      if (href.startsWith("http") && !href.startsWith(location.origin)) return;
      ev.preventDefault();
      navigate(href);
    },
    false
  );

  window.addEventListener("popstate", () => location.reload());

  /* --------------------------------------------------------- letter splits */

  function splitIn(root) {
    $$(".split", root || doc).forEach((el) => {
      el.querySelectorAll(":scope > span").forEach((ch, i) => {
        ch.style.transitionDelay = `${i * 26}ms`;
      });
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-in")));
    });
  }

  /* ------------------------------------------------------------ the cursor */

  const pair = $("#cursorPair");
  const square = pair ? $("[data-cursor-square]", pair) : null;
  const label = pair ? $("[data-cursor-label]", pair) : null;
  const cursor = { x: -999, y: -999, tx: -999, ty: -999, live: false, raf: null };

  function cursorLoop() {
    const k = 0.08;
    cursor.x += (cursor.tx - cursor.x) * k;
    cursor.y += (cursor.ty - cursor.y) * k;
    if (pair) pair.style.transform = `translate(${cursor.x.toFixed(2)}px, ${cursor.y.toFixed(2)}px)`;
    if (Math.abs(cursor.tx - cursor.x) > 0.15 || Math.abs(cursor.ty - cursor.y) > 0.15) {
      cursor.raf = requestAnimationFrame(cursorLoop);
    } else {
      cursor.raf = null;
    }
  }

  doc.addEventListener(
    "pointermove",
    (ev) => {
      if (!pair || coarse() || reduced()) return;
      cursor.tx = ev.clientX;
      cursor.ty = ev.clientY;
      if (!cursor.live) {
        cursor.x = ev.clientX;
        cursor.y = ev.clientY;
        cursor.live = true;
        pair.classList.add("is-live");
      }
      if (!cursor.raf) cursor.raf = requestAnimationFrame(cursorLoop);
    },
    { passive: true }
  );

  doc.addEventListener(
    "pointerover",
    (ev) => {
      if (!label || !pair || !cursor.live) return;
      const named = ev.target.closest("[data-cursor]");
      if (!named) return;
      label.textContent = named.dataset.cursor || "";
      square.style.display = named.classList.contains("opt") ? "none" : "block";
    },
    { passive: true }
  );

  /* ------------------------------------------------------- the entry route */

  function bootEntry() {
    setGround("dark");
    const veil = $("#loadingVeil");
    const counter = $("#counterWell");
    const cluster = $("[data-cluster]");
    const imgs = cluster ? $$("img", cluster) : [];

    const total = 3 + imgs.length; // two fonts + the chrome + the stills
    let done = 0;
    let pct = 0;

    const value = counter ? $(".counter-value", counter) : null;
    if (counter) {
      counter.hidden = false;
      counter.classList.remove("counter--roster", "counter--preview");
      counter.classList.add("counter--entry");
    }

    const bump = () => {
      done = Math.min(total, done + 1);
    };

    function paint() {
      const target = Math.min(100, (done / total) * 100);
      pct += (target - pct) * 0.14;
      if (value) value.textContent = `${Math.round(pct)}%`;
      if (pct >= 99.4) {
        if (value) value.textContent = "100%";
        if (veil) veil.classList.add("is-open");
        if (cluster) cluster.classList.add("is-open");
        if (counter) setTimeout(() => (counter.hidden = true), 800);
        return;
      }
      requestAnimationFrame(paint);
    }
    requestAnimationFrame(paint);

    // the counter reports real progress against a defined set, never guesswork
    let pending = total;
    const bumpOnce = (fn) => (arg) => {
      fn(arg);
      bump();
    };
    if (doc.fonts) {
      ["300 40px CirrusDisplay", "500 12px CirrusText"].forEach((spec) => {
        const p = doc.fonts.load(spec);
        if (p && p.then) p.then(() => bump()).catch(() => bump());
        else bump();
      });
    } else {
      bump();
      bump();
    }
    bump(); // the chrome
    if (!imgs.length) {
      while (done < total) bump();
    } else {
      imgs.forEach((img) => {
        if (img.complete && img.naturalWidth) bump();
        else {
          img.addEventListener("load", bumpOnce(() => {}), { once: true });
          img.addEventListener("error", bumpOnce(() => {}), { once: true });
        }
      });
    }
    void pending;
  }

  /* --------------------------------------------------- reveals and effects */

  function bootMediaDecode() {
    // the placeholder clears on decode or on failure alike
    $$("#content img").forEach((img) => {
      const inner = img.closest(".tile-inner");
      const clear = () => {
        if (!inner) return;
        inner.classList.add("is-decoded");
      };
      if (img.complete) {
        clear();
        if (!img.naturalWidth && inner) inner.classList.add("is-failed");
      } else {
        img.addEventListener("load", clear, { once: true });
        img.addEventListener("error", () => {
          if (inner) inner.classList.add("is-failed");
        }, { once: true });
      }
    });
  }

  function bootReveals() {
    const tiles = $$("[data-reveal]");
    if (!tiles.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-revealed");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px" }
    );
    tiles.forEach((t) => io.observe(t));
  }

  function bootFooterArrival() {
    const footer = $("#footer");
    if (!footer) return;
    const update = (y) => {
      void y;
      const docH = doc.body.scrollHeight - window.innerHeight;
      const p = docH > 0 ? Math.min(1, Math.max(0, window.scrollY / docH)) : 1;
      const last = p > 0.62 ? (p - 0.62) / 0.38 : 0;
      footer.classList.toggle("is-in", last > 0.02);
    };
    scroll.listeners.push(update);
    window.addEventListener("resize", update, { passive: true });
    update(window.scrollY);
  }

  function bootBlur() {
    const blocks = $$("[data-blurblock]");
    if (!blocks.length) return;
    if (window.innerWidth < 768 || reduced()) {
      blocks.forEach((b) => (b.style.filter = "none"));
      return;
    }
    const update = () => {
      const mid = window.innerHeight / 2;
      blocks.forEach((b) => {
        const r = b.getBoundingClientRect();
        const centre = r.top + r.height / 2;
        const d = Math.abs(centre - mid) / window.innerHeight;
        // full blur a screen away, zero at the window's centre; reversible
        const blur = Math.max(0, Math.min(10, d * 20));
        b.style.filter = `blur(${blur.toFixed(2)}px)`;
      });
    };
    scroll.listeners.push(update);
    window.addEventListener("resize", update, { passive: true });
    update();
  }

  /* --------------------------------------------------------- the reel layer */

  const reels = { active: new Set(), prepared: new Map() };

  function connectionSaveData() {
    const c = navigator.connection || {};
    return !!c.saveData || /2g/i.test(c.effectiveType || "");
  }

  function withinAWindow(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > -window.innerHeight && r.top < window.innerHeight * 2;
  }

  function startReel(slot) {
    if (reels.active.has(slot)) return;
    if (reels.active.size >= 2) {
      // never more than two run at once
      const first = reels.active.values().next().value;
      stopReel(first);
    }
    reels.active.add(slot);
    let state = reels.prepared.get(slot);
    if (!state) {
      state = makeReel(slot);
      reels.prepared.set(slot, state);
    }
    if (state) state.play();
  }

  function stopReel(slot) {
    const state = reels.prepared.get(slot);
    if (state) state.stop();
    reels.active.delete(slot);
  }

  function makeReel(slot) {
    const img = $("img", slot);
    if (!img) return null;
    const canvas = doc.createElement("canvas");
    canvas.className = "tile-reel";
    canvas.setAttribute("aria-hidden", "true");
    let seed = 7;
    for (const c of slot.dataset.seed || img.dataset.seed || "reel") seed = (seed * 31 + c.charCodeAt(0)) & 0xffff;
    const axisX = seed % 2 === 0;
    const dir = (seed % 3) - 1 || 1;
    let raf = null;
    let t0 = null;

    function frame(ts) {
      if (!t0) t0 = ts;
      const t = (ts - t0) / 1000;
      const w = (canvas.width = Math.max(2, slot.clientWidth));
      const h = (canvas.height = Math.max(2, slot.clientHeight));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const phase = (t % 12) / 12; // a 12 second cycle
      const shift = Math.sin(phase * Math.PI * 2) * (axisX ? w : h) * 0.06 * dir;
      const bright = 1 + Math.sin(((t % 29) / 29) * Math.PI * 2) * 0.04;
      ctx.filter = `brightness(${bright.toFixed(3)})`;
      for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
          const dx = axisX ? shift + x * w : x * w;
          const dy = axisX ? y * h : shift + y * h;
          try {
            ctx.drawImage(img, dx, dy, w, h);
          } catch (e) {
            /* not decoded yet; the still stays on screen */
          }
        }
      }
      ctx.filter = "none";
      drawGrain(ctx, w, h, t);
      raf = requestAnimationFrame(frame);
    }

    function play() {
      if (img.complete && img.naturalWidth) {
        if (!canvas.parentNode) slot.appendChild(canvas);
        canvas.classList.add("is-live");
        if (!raf) raf = requestAnimationFrame(frame);
      } else {
        img.addEventListener("load", play, { once: true });
      }
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      canvas.classList.remove("is-live");
    }
    return { play, stop };
  }

  function drawGrain(ctx, w, h, t) {
    if (!drawGrain.tile) {
      const c = doc.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d");
      const data = g.createImageData(128, 128);
      for (let i = 0; i < data.data.length; i += 4) {
        const v = 128 + (Math.random() * 2 - 1) * 26;
        data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
        data.data[i + 3] = 255;
      }
      g.putImageData(data, 0, 0);
      drawGrain.tile = c;
    }
    ctx.globalAlpha = 0.05;
    const off = (t * 37) % 128;
    for (let y = -128; y < h + 128; y += 128) {
      for (let x = -128; x < w + 128; x += 128) {
        ctx.drawImage(drawGrain.tile, x + off, y - off);
      }
    }
    ctx.globalAlpha = 1;
  }

  function bootReelSlots() {
    const slots = $$("[data-reel-slot]");
    if (!slots.length) return;
    if (reduced() || connectionSaveData()) return; // the still remains
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && withinAWindow(e.target)) startReel(e.target);
          else stopReel(e.target);
        });
      },
      { rootMargin: "100% 0px" }
    );
    slots.forEach((s) => io.observe(s));
  }

  /* ----------------------------------------------------------- the roster */

  function bootRoster() {
    const stage = $("[data-roster-stage]");
    if (!stage) return;
    const slides = $$("[data-slide]", stage);
    const filter = $("#disciplineFilter");
    const counter = $("#rosterCounter");
    if (!slides.length) return;

    const byDiscipline = {};
    slides.forEach((s) => {
      const d = s.dataset.discipline;
      (byDiscipline[d] = byDiscipline[d] || []).push(s);
    });

    let active = filter ? filter.querySelector("[aria-pressed='true']") : null;
    let discipline = active ? active.dataset.discipline : Object.keys(byDiscipline)[0];
    let index = 0;

    const visible = () => byDiscipline[discipline] || [];

    function show(i, announce) {
      const list = visible();
      if (!list.length) return;
      index = (i + list.length) % list.length;
      slides.forEach((s) => {
        const on = list[index] === s;
        s.classList.toggle("is-active", on);
        if (on) s.setAttribute("aria-current", "true");
        else s.removeAttribute("aria-current");
        // the active talent's name is the route's one top-level heading
        const name = s.querySelector(".roster-name");
        if (on && name && name.tagName !== "H1") {
          const h1 = doc.createElement("h1");
          h1.className = name.className;
          h1.innerHTML = name.innerHTML;
          name.replaceWith(h1);
        } else if (!on && name && name.tagName === "H1") {
          const h2 = doc.createElement("h2");
          h2.className = name.className;
          h2.innerHTML = name.innerHTML;
          name.replaceWith(h2);
        }
      });
      if (counter) {
        const v = $(".counter-value", counter);
        if (v) v.textContent = `${String(index + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")}`;
      }
      if (announce) {
        const live = $("#rosterAnnounce");
        if (live) {
          const name = list[index].querySelector(".roster-name");
          live.textContent = `${name ? name.textContent.trim() : ""}, ${discipline}`;
        }
      }
    }

    if (filter) {
      $$("button", filter).forEach((btn) => {
        btn.addEventListener("click", () => {
          discipline = btn.dataset.discipline;
          $$("button", filter).forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
          show(0, true);
        });
      });
    }

    let wheelLock = 0;
    stage.addEventListener(
      "wheel",
      (ev) => {
        if (window.innerWidth < 768 || window.innerHeight < 500) return;
        ev.preventDefault();
        const now = Date.now();
        if (now - wheelLock < 420) return;
        wheelLock = now;
        show(index + (ev.deltaY > 0 ? 1 : -1), true);
      },
      { passive: false }
    );

    const inView = () => {
      const r = stage.getBoundingClientRect();
      return r.top < window.innerHeight * 0.6 && r.bottom > window.innerHeight * 0.4;
    };

    doc.addEventListener("keydown", (ev) => {
      if (ev.target.closest("input, textarea, select, [contenteditable]")) return;
      if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
      if (!inView()) return;
      ev.preventDefault();
      show(index + (ev.key === "ArrowRight" ? 1 : -1), true);
    });

    if (!$("#rosterAnnounce")) {
      const live = doc.createElement("p");
      live.id = "rosterAnnounce";
      live.className = "sr";
      live.setAttribute("aria-live", "polite");
      stage.appendChild(live);
    }
    show(0, false);
  }

  /* ------------------------------------------------------- frame retraction */

  function bootRetraction() {
    if (window.innerWidth >= 768 && window.innerHeight >= 500) return;
    let last = null;
    const update = () => {
      const down = window.scrollY > 40;
      if (down !== last && frame) {
        frame.classList.toggle("is-retracted", down);
        last = down;
      }
    };
    scroll.listeners.push(update);
    window.addEventListener("resize", update, { passive: true });
    update();
  }

  /* ------------------------------------------------------- contact overlay */

  function bootOverlay() {
    const overlay = $("[data-overlay]");
    if (!overlay) return;
    let opener = null;
    const open = (from) => {
      opener = from || null;
      overlay.hidden = false;
      requestAnimationFrame(() => overlay.classList.add("is-open"));
      const c = $("[data-overlay-close]", overlay);
      if (c) c.focus();
    };
    const close = () => {
      overlay.classList.remove("is-open");
      setTimeout(() => (overlay.hidden = true), reduced() ? 0 : 400);
      if (opener) opener.focus();
    };
    $$("[data-contact]").forEach((a) => {
      a.addEventListener("click", (ev) => {
        if (coarse() || window.innerWidth < 768) {
          ev.preventDefault();
          open(a);
        }
      });
    });
    const btn = $("[data-overlay-close]", overlay);
    if (btn) btn.addEventListener("click", close);
    doc.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !overlay.hidden && overlay.classList.contains("is-open")) close();
    });
    overlay.addEventListener("keydown", (ev) => {
      if (ev.key !== "Tab") return;
      const items = $$("a, button", overlay).filter((e) => e.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (ev.shiftKey && doc.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && doc.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    });
  }

  /* --------------------------------------------------------- studio forms */

  async function api(path, opts) {
    const headers = { "Content-Type": "application/json" };
    const token = sessionStorage.getItem("cirrus.token");
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(path, { method: "POST", ...opts, headers });
    if (resp.status === 401 && path.startsWith("/api/studio")) {
      // an expired token mid-edit: back to the sign-in page, nothing half saved
      sessionStorage.removeItem("cirrus.token");
      sessionStorage.setItem("cirrus.back", location.pathname);
      location.href = "/studio/login";
      throw new Error("the session has expired; sign in again");
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || "that did not work");
    return data;
  }


  function readForm(form) {
    const out = {};
    new FormData(form).forEach((v, k) => (out[k] = v));
    return out;
  }

  function showErr(el, err) {
    if (!el) return;
    el.textContent = err.message || String(err);
    el.hidden = false;
  }

  function bootAuth() {
    const login = $("[data-login-form]");
    if (login) {
      if (!sessionStorage.getItem("cirrus.back")) sessionStorage.setItem("cirrus.back", "/studio");
      login.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const err = $("[data-error]", login);
        if (err) err.hidden = true;
        try {
          const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(readForm(login)) });
          sessionStorage.setItem("cirrus.token", data.token);
          sessionStorage.setItem("cirrus.role", data.account.role);
          sessionStorage.setItem("cirrus.email", data.account.email);
          const back = sessionStorage.getItem("cirrus.back") || "/studio";
          sessionStorage.removeItem("cirrus.back");
          location.href = back;
        } catch (e) {
          showErr(err, e);
        }
      });
    }
    const signup = $("[data-signup-form]");
    if (signup) {
      signup.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const err = $("[data-error]", signup);
        if (err) err.hidden = true;
        try {
          const data = await api("/api/auth/signup", { method: "POST", body: JSON.stringify(readForm(signup)) });
          sessionStorage.setItem("cirrus.token", data.token);
          sessionStorage.setItem("cirrus.role", data.account.role);
          sessionStorage.setItem("cirrus.email", data.account.email);
          location.href = "/";
        } catch (e) {
          showErr(err, e);
        }
      });
    }
    $$("[data-logout]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        try {
          await api("/api/auth/logout", { method: "POST" });
        } catch (e) {
          /* the cookie is cleared server-side regardless */
        }
        sessionStorage.clear();
        location.href = "/";
      })
    );
  }

  function bootStudio() {
    if (!(doc.body.dataset.route || "").startsWith("studio")) return;
    const role = sessionStorage.getItem("cirrus.role");
    if (role && role !== "producer") {
      location.href = "/";
      return;
    }

    const palette = $("[data-palette]");
    if (palette) {
      const input = $("[data-palette-input]", palette);
      const rows = $$("li", $("[data-palette-list]", palette) || palette);
      const applyFilter = () => {
        const q = (input.value || "").toLowerCase().trim();
        rows.forEach((li) => {
          // the actions stay offered whatever is typed; only records narrow
          if (li.dataset.action) {
            li.hidden = false;
            return;
          }
          const hay = `${li.dataset.title || ""} ${li.dataset.slug || ""} ${li.dataset.kind || ""}`.toLowerCase();
          li.hidden = !!q && !hay.includes(q);
        });
      };

      if (input) {
        input.addEventListener("input", applyFilter);
        input.focus();
      }
      rows.forEach((li) => {
        const btn = $("button", li);
        if (!btn) return;
        btn.addEventListener("click", () => {
          if (li.dataset.action === "new-talent") location.href = "/studio/talents/new";
          else if (li.dataset.action === "new-work") location.href = "/studio/works/new";
          else if (li.dataset.action === "reorder") runReorder();
          else if (li.dataset.itemId) location.href = `/studio/items/${li.dataset.itemId}`;
        });
      });
    }

    async function runReorder() {
      try {
        const items = await api("/api/studio/items?kind=work");
        const text = items.map((i, n) => `${n + 1}. ${i.title}`).join("\n");
        const answer = prompt(`Works in order. Enter the new order as numbers, comma separated.\n\n${text}`);
        if (!answer) return;
        const nums = answer.split(",").map((s) => parseInt(s.trim(), 10));
        const ids = nums.map((n) => items[n - 1] && items[n - 1].id).filter(Boolean);
        if (ids.length !== items.length) {
          alert("Every work must appear exactly once.");
          return;
        }
        await api("/api/studio/works/order", { method: "POST", body: JSON.stringify({ ordered_ids: ids }) });
        location.reload();
      } catch (e) {
        alert(e.message);
      }
    }

    const form = $("[data-form]");
    if (form) {
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const err = $("[data-error]", form);
        if (err) err.hidden = true;
        const box = $("[data-item-form]");
        const id = box && box.dataset.itemId;
        try {
          const body = readForm(form);
          if (id) {
            await api(`/api/studio/items/${id}`, { method: "PATCH", body: JSON.stringify(body) });
            location.reload();
          } else {
            const made = await api("/api/studio/items", { method: "POST", body: JSON.stringify(body) });
            location.href = `/studio/items/${made.id}`;
          }
        } catch (e) {
          showErr(err, e);
        }
      });
    }

    const slugBox = $("[data-slug-box]");
    if (slugBox) {
      const btn = $("[data-slug-save]", slugBox);
      if (btn)
        btn.addEventListener("click", async () => {
          const box = $("[data-item-form]");
          const input = $("#slug");
          try {
            await api(`/api/studio/items/${box.dataset.itemId}/slug`, {
              method: "POST",
              body: JSON.stringify({ slug: input.value }),
            });
            location.reload();
          } catch (e) {
            alert(e.message);
          }
        });
    }

    const mediaForm = $("[data-media-form]");
    if (mediaForm) {
      mediaForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const err = $("[data-media-error]", mediaForm);
        if (err) err.hidden = true;
        const box = $("[data-item-form]");
        const body = readForm(mediaForm);
        const size = (body.size || "598x320").split("x").map(Number);
        try {
          await api(`/api/studio/items/${box.dataset.itemId}/media`, {
            method: "POST",
            body: JSON.stringify({ role: body.role, seed: body.seed, width: size[0], height: size[1], alt: body.alt }),
          });
          location.reload();
        } catch (e) {
          showErr(err, e);
        }
      });
    }

    const creditForm = $("[data-credit-form]");
    if (creditForm) {
      creditForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const err = $("[data-credit-error]", creditForm);
        if (err) err.hidden = true;
        const box = $("[data-item-form]");
        const body = readForm(creditForm);
        try {
          await api(`/api/studio/items/${box.dataset.itemId}/credits`, {
            method: "POST",
            body: JSON.stringify({ role: body.role, name: body.name, talent_id: body.talent_id || null }),
          });
          location.reload();
        } catch (e) {
          showErr(err, e);
        }
      });
    }

    const pub = $("[data-publish]");
    if (pub)
      pub.addEventListener("click", async () => {
        const box = $("[data-item-form]");
        try {
          await api(`/api/studio/items/${box.dataset.itemId}/publish`, {
            method: "POST",
            body: JSON.stringify({ published: true }),
          });
          location.href = `/studio/items/${box.dataset.itemId}/published`;
        } catch (e) {
          alert(e.message);
        }
      });

    const unpub = $("[data-unpublish]");
    if (unpub)
      unpub.addEventListener("click", async () => {
        const box = $("[data-item-form]");
        try {
          await api(`/api/studio/items/${box.dataset.itemId}/publish`, {
            method: "POST",
            body: JSON.stringify({ published: false }),
          });
          location.reload();
        } catch (e) {
          alert(e.message);
        }
      });

    const mint = $("[data-preview-token]");
    if (mint)
      mint.addEventListener("click", async () => {
        const box = $("[data-item-form]");
        const out = box ? $("[data-token-out]", box) : null;
        try {
          const data = await api("/api/studio/preview-tokens", {
            method: "POST",
            body: JSON.stringify({ item_id: box.dataset.itemId }),
          });
          if (out) out.textContent = `Preview, good for 15 minutes: /preview/${data.token}`;
        } catch (e) {
          if (out) out.textContent = e.message;
        }
      });
  }

  /* ------------------------------------------------------- the preview wait */

  function bootPreviewWait() {
    const counter = $("[data-preview-counter]");
    if (!counter) return;
    // one counter component, three routes: this is the preview's waiting state
    let n = 0;
    const value = $(".counter-value", counter);
    if (value) value.textContent = "Loading preview...";
    const imgs = $$("#content img");
    const total = imgs.length;
    let done = 0;
    const tick = setInterval(() => {
      n += 1;
      if (value) value.textContent = `Loading preview...`;
      if (done >= total || n > 60) {
        clearInterval(tick);
        counter.classList.add("is-done");
      }
    }, 100);
    if (!total) {
      done = 1;
    } else {
      imgs.forEach((img) => {
        if (img.complete && img.naturalWidth) done += 1;
        else {
          img.addEventListener("load", () => (done += 1), { once: true });
          img.addEventListener("error", () => (done += 1), { once: true });
        }
      });
    }
  }

  /* ------------------------------------------------------------ analytics */

  function bootAnalytics() {
    // waits until the route is interactive, counts a page view and nothing
    // else, and a loader that never arrives fails quietly
    const send = () => {
      try {
        fetch("/api/analytics/pageview", {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: location.pathname }),
        }).catch(() => {});
      } catch (e) {
        /* quiet by contract */
      }
    };
    if ("requestIdleCallback" in window) requestIdleCallback(send, { timeout: 3000 });
    else setTimeout(send, 1200);
  }

  /* ------------------------------------------------------------ boot logic */

  function teardownRoute() {
    scroll.listeners.length = 0;
    for (const [, state] of reels.prepared) if (state && state.stop) state.stop();
    reels.prepared.clear();
    reels.active.clear();
  }

  function bootRoute(route, pathname) {
    route = route || parseRouteFrom(pathname || location.pathname) || "entry";
    setGround(route === "entry" ? "dark" : "light");
    if (route === "entry") bootEntry();
    else {
      const veil = $("#loadingVeil");
      if (veil) veil.classList.add("is-open");
      const counter = $("#counterWell");
      if (counter) counter.hidden = true;
    }
    if (route === "works") {
      const sharp = $("[data-blurline]");
      if (sharp) requestAnimationFrame(() => requestAnimationFrame(() => sharp.classList.add("is-sharp")));
    }
    bootMediaDecode();
    bootReveals();
    bootFooterArrival();
    if (route === "about") bootBlur();
    if (route === "talents") bootRoster();
    bootReelSlots();
    bootRetraction();
    if ($("[data-preview-counter]")) bootPreviewWait();
    splitIn($("#content"));
  }

  function boot() {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => html.classList.toggle("reduced", mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener("change", apply);

    setMark(doc.body.dataset.route || "entry");
    setActiveNav(doc.body.dataset.route);
    window.addEventListener("scroll", onNativeScroll, { passive: true });
    bootOverlay();
    bootAuth();
    bootStudio();
    bootRoute(doc.body.dataset.route, location.pathname);
    bootAnalytics();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
