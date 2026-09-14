/* Cirrus front end. Alpine.js drives everything below; the document is
   already complete when this runs. */

/* ---------------------------------------------------------------- helpers */

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () =>
  matchMedia("(max-width: 768px), (max-height: 500px)").matches;

document.documentElement.classList.add("js");

/* ------------------------------------------------------- split characters */

function splitLabel(el) {
  const text = el.textContent;
  el.setAttribute("aria-label", text);
  el.textContent = "";
  const frag = document.createDocumentFragment();
  [...text].forEach((ch, i) => {
    const s = document.createElement("span");
    s.className = "char";
    s.setAttribute("aria-hidden", "true");
    s.textContent = ch === " " ? "\u00a0" : ch;
    s.style.transition =
      "transform 0.45s cubic-bezier(.83,.12,.35,.96), opacity 0.3s";
    s.style.transform = "translateY(0)";
    s.style.display = "inline-block";
    frag.appendChild(s);
  });
  el.appendChild(frag);
  const chars = el.querySelectorAll(".char");
  requestAnimationFrame(() => {
    chars.forEach((c, i) => {
      c.style.transitionDelay = `${i * 22}ms`;
    });
  });
  return chars;
}

function initSplits() {
  document.querySelectorAll("[data-split]").forEach((el) => {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = "1";
    splitLabel(el);
  });
}

/* ------------------------------------------------------------ cursor pair */

function initCursor() {
  if (matchMedia("(pointer: coarse)").matches) return;
  const cursor = document.getElementById("cursor");
  const square = cursor ? cursor.querySelector(".cursor-square") : null;
  const label = document.getElementById("cursor-label");
  if (!cursor || !square || !label) return;

  let x = -999, y = -999, tx = -999, ty = -999, live = false, last = 0, raf = 0;
  let hideSquare = false, directional = false;

  window.addEventListener(
    "pointermove",
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!live) {
        live = true;
        x = tx; y = ty;
        cursor.classList.add("is-live");
      }
    },
    { passive: true }
  );

  window.addEventListener(
    "pointerover",
    (e) => {
      const target = e.target.closest("a, button, [data-cursor]");
      if (!target) {
        label.textContent = "";
        directional = false;
        cursor.classList.remove("cursor--directional");
        return;
      }
      const text =
        target.getAttribute("data-cursor") ||
        (target.getAttribute("aria-label") || target.textContent || "").trim();
      label.textContent = text.slice(0, 48);
      hideSquare = target.classList.contains("no-cursor-square") ||
        target.closest(".no-cursor-square") !== null;
      directional = target.hasAttribute("data-cursor-directional");
      cursor.classList.toggle("cursor--directional", directional);
    },
    { passive: true }
  );

  document.addEventListener("pointerleave", () => {
    live = false;
    cursor.classList.remove("is-live");
  });

  function frame(t) {
    const dt = last ? Math.min(64, t - last) : 16.7;
    last = t;
    const k = reduced() ? 1 : 1 - Math.pow(1 - 0.08, dt / 16.667);
    x += (tx - x) * k;
    y += (ty - y) * k;
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    square.style.opacity = hideSquare ? "0" : "1";
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}

/* -------------------------------------------------- entry route: counter */

document.addEventListener("alpine:init", () => {
  window.Alpine.data("entryRoute", (count) => ({
    progress: 0,
    count: "0%",
    done: false,
    start() {
      const steps = 2 + 1 + Math.max(1, count); // fonts, chrome, stills
      let loaded = 0;
      const bump = () => {
        loaded += 1;
        this.progress = Math.min(1, loaded / steps);
        this.count = `${Math.round(this.progress * 100)}%`;
        if (this.progress >= 1) this.finish();
      };
      const afterFonts = (cb) => {
        if (!document.fonts || !document.fonts.ready) return cb();
        document.fonts.ready.then(cb, cb);
      };
      const urls = [
        "/static/fonts/cirrus-display.woff2",
        "/static/fonts/cirrus-text.woff2",
      ];
      urls.forEach((u) => {
        fetch(u, { mode: "same-origin" })
          .then(() => bump(), bump);
      });
      afterFonts(bump);
      document.querySelectorAll(".entry-still img").forEach((img) => {
        if (img.complete && img.naturalWidth) bump();
        else {
          img.addEventListener("load", bump, { once: true });
          img.addEventListener("error", bump, { once: true });
        }
      });
      // Safety: never stall under 30s.
      const t0 = performance.now();
      const guard = setInterval(() => {
        if (this.done) return clearInterval(guard);
        if (performance.now() - t0 > 30000) {
          this.progress = 1;
          this.count = "100%";
          this.finish();
          clearInterval(guard);
        }
      }, 500);
    },
    finish() {
      if (this.done) return;
      this.done = true;
      this.count = "100%";
      document.body.dataset.entryDone = "1";
    },
  }));

  window.Alpine.data("roster", (talents, disciplines) => ({
    talents: talents || [],
    disciplines: disciplines || [],
    active: (disciplines && disciplines[0]) || "",
    index: 0,
    announce: false,
    markerY: 0,
    get set() {
      return this.talents.filter((t) => t.discipline === this.active);
    },
    get current() {
      return this.set[this.index] || this.set[0] || { title: "", slug: "" };
    },
    get visible() {
      const c = this.current;
      return c ? [c] : [];
    },
    labelFor(d) {
      return (d || "").toUpperCase();
    },
    init() {
      this.index = 0;
      this.$watch("active", () => (this.index = 0));
    },
    setDiscipline(d) {
      this.active = d;
      this.index = 0;
    },
    advance(dir) {
      const n = this.set.length;
      if (!n) return;
      this.index = (this.index + dir + n) % n;
      this.announce = true;
      setTimeout(() => (this.announce = false), 400);
    },
  }));

  window.Alpine.data("workDetail", () => ({}));

  window.Alpine.data("authForm", () => ({
    email: "",
    password: "",
    error: "",
    busy: false,
    init() {},
    async submit() {
      this.error = "";
      this.busy = true;
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: this.email, password: this.password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.error = data.error || "That sign-in did not work.";
          return;
        }
        document.cookie = `cirrus_token=${data.token}; path=/; max-age=1209600; SameSite=Lax`;
        location.href = data.role === "producer" ? "/studio" : "/";
      } catch {
        this.error = "The studio did not answer. Try again.";
      } finally {
        this.busy = false;
      }
    },
  }));

  window.Alpine.data("signupForm", () => ({
    email: "",
    password: "",
    error: "",
    busy: false,
    async submit() {
      this.error = "";
      this.busy = true;
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: this.email, password: this.password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.error = data.error || "That sign-up did not work.";
          return;
        }
        document.cookie = `cirrus_token=${data.token}; path=/; max-age=1209600; SameSite=Lax`;
        location.href = "/";
      } catch {
        this.error = "The site did not answer. Try again.";
      } finally {
        this.busy = false;
      }
    },
  }));

  window.Alpine.data("palette", (house) => ({
    house,
    items: [],
    loaded: false,
    open: false,
    q: "",
    cursor: 0,
    get filtered() {
      const q = this.q.trim().toLowerCase();
      const actions = [
        { key: "a:new-talent", action: true, kindLabel: "ACTION", title: "New talent", meta: "" },
        { key: "a:new-work", action: true, kindLabel: "ACTION", title: "New work", meta: "" },
        { key: "a:reorder", action: true, kindLabel: "ACTION", title: "Reorder index", meta: "" },
      ];
      const records = this.items.map((it) => ({
        key: `i:${it.id}`,
        action: false,
        kindLabel: it.kind === "work" ? "WORK" : "TALENT",
        title: it.title,
        meta: `${it.slug} · ${it.published ? "live" : "unlisted"}`,
        item: it,
      }));
      const all = [...actions, ...records];
      if (!q) return all;
      return all.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          (o.meta || "").toLowerCase().includes(q)
      );
    },
    load() {
      fetch("/api/studio/items", {
        headers: { Authorization: "Bearer " + (getCookie("cirrus_token") || "") },
      })
        .then((r) => {
          if (r.status === 401 || r.status === 403) {
            location.href = "/studio/login";
            return [];
          }
          if (!r.ok) return [];
          return r.json();
        })
        .then((rows) => {
          this.items = rows || [];
          this.loaded = true;
        })
        .catch(() => {
          this.loaded = true;
        });
      const onKey = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          this.openPalette();
        }
      };
      window.addEventListener("keydown", onKey);
    },
    openPalette() {
      this.open = true;
      this.cursor = 0;
      this.$nextTick(() => this.$refs.input && this.$refs.input.focus());
    },
    closePalette() {
      this.open = false;
    },
    move(d) {
      const n = this.filtered.length;
      if (n) this.cursor = (this.cursor + d + n) % n;
    },
    runFirst() {
      if (this.filtered.length) this.choose(this.filtered[this.cursor]);
    },
    choose(opt) {
      if (opt.action) {
        if (opt.key === "a:new-talent") location.href = "/studio/talents/new";
        if (opt.key === "a:new-work") location.href = "/studio/works/new";
        if (opt.key === "a:reorder") location.href = "/studio#reorder";
        return;
      }
      location.href = `/studio/items/${opt.item.id}`;
    },
    signOut() {
      fetch("/api/auth/logout", { method: "POST" }).finally(() => {
        document.cookie = "cirrus_token=; path=/; max-age=0";
        location.href = "/";
      });
    },
  }));

  window.Alpine.data("itemForm", (opts) => ({
    kind: opts.kind,
    item: opts.item || { title: "", slug: "", published: false },
    itemId: opts.item ? opts.item.id : null,
    title: opts.item ? opts.item.title : "",
    slug: opts.item ? opts.item.slug : "",
    discipline: opts.item && opts.item.discipline ? opts.item.discipline : "director",
    variant: opts.item && opts.item.variant ? opts.item.variant : "left",
    media: (opts.item && opts.item.media) || [],
    credits: (opts.item && opts.item.credits) || [],
    newMedia: { role: "poster", seed: "", width: 598, height: 320, alt: "" },
    newCredit: { role: "", name: "" },
    error: "",
    mediaError: "",
    creditError: "",
    previewUrl: "",
    busy: false,
    init() {},
    get heading() {
      if (this.itemId) return this.title || "Edit record";
      return this.kind === "talent" ? "New talent" : "New work";
    },
    get suggestedSlug() {
      return (this.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    },
    headers() {
      return {
        "Content-Type": "application/json",
        Authorization: "Bearer " + (getCookie("cirrus_token") || ""),
      };
    },
    async save() {
      this.error = "";
      this.busy = true;
      try {
        let res;
        if (this.itemId) {
          res = await fetch(`/api/studio/items/${this.itemId}`, {
            method: "PATCH",
            headers: this.headers(),
            body: JSON.stringify({
              title: this.title,
              variant: this.kind === "work" ? this.variant : undefined,
              discipline: this.kind === "talent" ? this.discipline : undefined,
            }),
          });
        } else {
          res = await fetch("/api/studio/items", {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
              kind: this.kind,
              title: this.title,
              slug: this.slug || this.suggestedSlug,
              variant: this.kind === "work" ? this.variant : undefined,
              discipline: this.kind === "talent" ? this.discipline : undefined,
            }),
          });
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.error = data.error || "That did not save.";
          return;
        }
        location.href = `/studio/items/${data.id}`;
      } catch {
        this.error = "The studio did not answer. Try again.";
      } finally {
        this.busy = false;
      }
    },
    cancel() {
      location.href = "/studio";
    },
    async addMedia() {
      this.mediaError = "";
      if (!this.itemId) {
        this.mediaError = "Save the record before attaching media.";
        return;
      }
      this.busy = true;
      try {
        const res = await fetch(`/api/studio/items/${this.itemId}/media`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(this.newMedia),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.mediaError = data.error || "That media did not attach.";
          return;
        }
        this.media.push(data);
        this.newMedia = { role: "gallery", seed: "", width: 598, height: 320, alt: "" };
      } catch {
        this.mediaError = "The studio did not answer. Try again.";
      } finally {
        this.busy = false;
      }
    },
    async removeMedia(m) {
      await fetch(`/api/studio/items/${this.itemId}/media/${m.media_id || m.id}`, {
        method: "DELETE",
        headers: this.headers(),
      }).catch(() => {});
      this.media = this.media.filter((x) => (x.media_id || x.id) !== (m.media_id || m.id));
    },
    async addCredit() {
      this.creditError = "";
      if (!this.itemId) {
        this.creditError = "Save the record before adding credits.";
        return;
      }
      this.busy = true;
      try {
        const res = await fetch(`/api/studio/items/${this.itemId}/credits`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(this.newCredit),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.creditError = data.error || "That credit did not add.";
          return;
        }
        this.credits.push(data);
        this.newCredit = { role: "", name: "" };
      } catch {
        this.creditError = "The studio did not answer. Try again.";
      } finally {
        this.busy = false;
      }
    },
    async removeCredit(c) {
      await fetch(`/api/studio/items/${this.itemId}/credits/${c.id}`, {
        method: "DELETE",
        headers: this.headers(),
      }).catch(() => {});
      this.credits = this.credits.filter((x) => x.id !== c.id);
    },
    async togglePublish() {
      this.error = "";
      this.busy = true;
      const target = !this.item.published;
      try {
        const res = await fetch(`/api/studio/items/${this.itemId}/publish`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ published: target }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.error = data.error || "That did not publish.";
          return;
        }
        if (target) location.href = `/studio/items/${this.itemId}/published`;
        else this.item.published = false;
      } catch {
        this.error = "The studio did not answer. Try again.";
      } finally {
        this.busy = false;
      }
    },
    async mintPreview() {
      this.error = "";
      this.busy = true;
      try {
        const res = await fetch("/api/studio/preview-tokens", {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ item_id: this.itemId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.error = data.error || "No preview token was minted.";
          return;
        }
        this.previewUrl = `/preview/${data.token}`;
      } catch {
        this.error = "The studio did not answer. Try again.";
      } finally {
        this.busy = false;
      }
    },
    async rename() {
      const next = prompt("New slug", this.slug);
      if (!next) return;
      this.busy = true;
      try {
        const res = await fetch(`/api/studio/items/${this.itemId}/slug`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ slug: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.error = data.error || "That slug did not change.";
          return;
        }
        this.slug = data.slug;
      } catch {
        this.error = "The studio did not answer. Try again.";
      } finally {
        this.busy = false;
      }
    },
  }));
});

function getCookie(name) {
  const m = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[2]) : "";
}

/* ------------------------------------------- scroll: one source, many effects */

function initScroll() {
  const effects = [];
  let smooth = null;
  let target = window.scrollY;
  let current = target;
  let raf = 0;
  let idleTimer = 0;

  const scrollingClass = () => {
    document.documentElement.classList.add("is-scrolling");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => document.documentElement.classList.remove("is-scrolling"),
      180
    );
  };

  const prefersReduce = () =>
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function register(fn) {
    effects.push(fn);
  }

  function tick() {
    current += (target - current) * 0.16;
    if (Math.abs(target - current) < 0.5) current = target;
    window.scrollTo(0, current);
    effects.forEach((f) => f(current));
    if (current !== target) raf = requestAnimationFrame(tick);
    else raf = 0;
  }

  function onWheel(e) {
    if (prefersReduce()) return;
    if (e.ctrlKey) return;
    const el = e.target.closest("[data-native-scroll]");
    if (el) return;
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? 400 : 1;
    target = Math.max(
      0,
      Math.min(
        document.documentElement.scrollHeight - window.innerHeight,
        target + e.deltaY * scale
      )
    );
    scrollingClass();
    if (!raf) raf = requestAnimationFrame(tick);
  }

  window.addEventListener("wheel", onWheel, { passive: false });

  // Keyboard, anchors and find-in-page keep native behaviour.
  window.addEventListener(
    "scroll",
    () => {
      if (!raf) {
        target = current = window.scrollY;
        effects.forEach((f) => f(current));
      }
    },
    { passive: true }
  );

  const revalidate = () => effects.forEach((f) => f(window.scrollY));
  window.addEventListener("resize", revalidate);
  requestAnimationFrame(revalidate);

  /* ---- the about blur: scrubbed, continuous, reversible ---- */
  const blocks = [...document.querySelectorAll("[data-blur-block]")];
  register((y) => {
    if (prefersReduce() || narrow()) {
      blocks.forEach((b) => b.classList.add("is-sharp"));
      return;
    }
    const mid = window.innerHeight / 2;
    blocks.forEach((b) => {
      const r = b.getBoundingClientRect();
      const centre = r.top + y + r.height / 2;
      const dist = Math.abs(centre - (y + mid));
      const reach = window.innerHeight;
      const t = Math.max(0, Math.min(1, 1 - dist / reach));
      b.style.filter = `blur(${(1 - t) * 10}px)`;
    });
  });

  /* ---- the footer arrival ---- */
  const footer = document.getElementById("footer");
  if (footer) {
    register((y) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const remain = Math.max(0, max - y);
      const third = window.innerHeight;
      const t = 1 - Math.min(1, remain / (third * 1.5));
      footer.classList.toggle("is-arrived", remain < third * 1.5);
    });
  }

  /* ---- the narrow frame retraction ---- */
  const frame = document.getElementById("frame");
  if (frame) {
    register((y) => {
      if (!narrow()) {
        frame.classList.remove("is-retracted");
        return;
      }
      frame.classList.toggle("is-retracted", y > 80);
    });
  }

  /* ---- the media reveal ---- */
  const tiles = [...document.querySelectorAll(".tile-frame")];
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-revealed");
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    tiles.forEach((t) => io.observe(t));
  } else {
    tiles.forEach((t) => t.classList.add("is-revealed"));
  }

  /* ---- reels: at most two, near the viewport, still first ---- */
  const reels = [...document.querySelectorAll("[data-play]")];
  const reelIO =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((en) => {
              const tile = en.target;
              if (en.isIntersecting) reelStart(tile);
              else reelStop(tile);
            });
          },
          { rootMargin: `${window.innerHeight}px 0px` }
        )
      : null;
  reels.forEach((r) => reelIO && reelIO.observe(r));

  const running = [];
  function reelStart(tile) {
    if (prefersReduce() || !navigator.onLine) return;
    if (matchMedia("(pointer: coarse)").matches) return;
    if (running.length >= 2) return;
    const canvas = tile.querySelector("canvas.tile-reel");
    const img = tile.querySelector("img.tile-still");
    if (!canvas || !img) return;
    if (canvas.dataset.running) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const params = tile.dataset.reel ? JSON.parse(tile.dataset.reel) : {};
    const axis = params.axis || "x";
    const dir = params.direction || 1;
    const cycle = (params.cycle || 12) * 1000;
    const amp = params.amp || 0.07;
    const phase = params.phase || 0;
    canvas.dataset.running = "1";
    running.push(canvas);
    let raf = 0;
    const draw = (t) => {
      const p = ((t / cycle + phase) % 1);
      const off = (p * 2 - 1) * amp;
      const bright = 1 + Math.sin((t / (cycle * 1.7)) * Math.PI * 2) * 0.05;
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (img.complete && img.naturalWidth) {
          const w = canvas.width, h = canvas.height;
          const iw = img.naturalWidth, ih = img.naturalHeight;
          const scale = Math.max(w / iw, h / ih) * 1.16;
          const dw = iw * scale, dh = ih * scale;
          const dx = (w - dw) / 2 + (axis === "x" ? off * w : 0);
          const dy = (h - dh) / 2 + (axis === "y" ? off * h : 0);
          ctx.filter = `brightness(${bright})`;
          ctx.drawImage(img, dx, dy, dw, dh);
          ctx.filter = "none";
          canvas.classList.add("is-playing");
        }
      } catch {
        /* fallback: the still stays */
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    canvas.dataset.raf = String(raf);
  }
  function reelStop(tile) {
    const canvas = tile.querySelector("canvas.tile-reel");
    if (!canvas || !canvas.dataset.running) return;
    const raf = Number(canvas.dataset.raf || 0);
    if (raf) cancelAnimationFrame(raf);
    canvas.classList.remove("is-playing");
    delete canvas.dataset.running;
    const i = running.indexOf(canvas);
    if (i > -1) running.splice(i, 1);
  }
}

/* -------------------------------------------------- route transition */

function initTransitions() {
  const veil = document.getElementById("route-veil");
  if (!veil) return;
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[data-route-link]");
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("mailto:")) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    document.body.classList.add("is-navigating");
    setTimeout(() => {
      location.href = href;
    }, reduced() ? 0 : 380);
  });
}

/* ------------------------------------------------------ contact overlay */

function initContact() {
  const overlay = document.getElementById("contact-overlay");
  if (!overlay) return;
  const links = [...document.querySelectorAll("[data-contact-link]")];
  const close = overlay.querySelector("[data-contact-close]");
  let opener = null;

  const open = (from) => {
    opener = from || null;
    overlay.hidden = false;
    requestAnimationFrame(() => {
      overlay.querySelectorAll(".contact-inner > *").forEach((el, i) => {
        el.style.transitionDelay = `${i * 60}ms`;
        el.style.transform = "translateY(0)";
        el.style.opacity = "1";
      });
    });
    close && close.focus();
  };
  const shut = () => {
    overlay.querySelectorAll(".contact-inner > *").forEach((el, i) => {
      el.style.transform = "translateY(200px)";
      el.style.opacity = "0";
    });
    setTimeout(() => (overlay.hidden = true), reduced() ? 0 : 300);
    if (opener) opener.focus();
  };

  links.forEach((l) => {
    l.addEventListener("click", (e) => {
      if (!narrow()) return; // wide: the mail client opens directly
      e.preventDefault();
      open(l);
    });
  });
  close && close.addEventListener("click", shut);
  overlay.querySelectorAll(".contact-mail").forEach((m) =>
    m.addEventListener("click", () => setTimeout(shut, 120))
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) shut();
  });

  // park the items below their resting position
  overlay.querySelectorAll(".contact-inner > *").forEach((el) => {
    el.style.transform = "translateY(200px)";
    el.style.opacity = "0";
  });
}

/* --------------------------------------------------------------- boot */

window.addEventListener("DOMContentLoaded", () => {
  initSplits();
  initCursor();
  initScroll();
  initTransitions();
  initContact();
});

// page views, and nothing else, once the route is interactive
window.addEventListener(
  "load",
  () => {
    try {
      navigator.sendBeacon &&
        navigator.sendBeacon("/api/analytics/view", JSON.stringify({}));
    } catch {}
  },
  { once: true }
);
