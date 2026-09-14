/* Cirrus front end: the rendered document's behaviour and nothing else. */
(function () {
  "use strict";

  const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = () => navigator.connection && (navigator.connection.saveData ||
    /metered/i.test(navigator.connection.effectiveType || ""));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ------------------------------------------------- one scroll source */

  const scroll = {
    y: 0, target: 0, raf: 0, inFlight: false, effects: [], native: false,
    init() {
      this.native = prefersReduced();
      if (this.native) return;
      window.addEventListener("wheel", (e) => {
        if (e.ctrlKey || e.target.closest && e.target.closest("[data-native-scroll]")) return;
        if (document.body.classList.contains("locked")) return;
        e.preventDefault();
        this.target = clamp(this.target + e.deltaY, 0, this.max());
        this.kick();
      }, { passive: false });
      window.addEventListener("scroll", () => {
        if (this.suppress) return;
        if (Math.abs(window.scrollY - this.y) > 2) { this.target = window.scrollY; this.y = window.scrollY; this.run(); }
      });
    },
    max() { return Math.max(0, document.documentElement.scrollHeight - window.innerHeight); },
    kick() {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        const dt = 1 / 60;
        this.y += (this.target - this.y) * Math.min(1, dt * 12);
        if (Math.abs(this.target - this.y) < 0.4) { this.y = this.target; }
        this.run();
        if (this.y !== this.target) this.kick();
      });
    },
    run() {
      document.body.classList.toggle("scrolling", this.inFlight = Math.abs(this.target - this.y) > 0.5);
      for (const f of this.effects) f(this.y);
    },
    on(fn) { this.effects.push(fn); fn(this.y); },
  };

  /* ----------------------------------------------------- the cursor pair */

  const cursor = {
    x: -999, y: -999, tx: -999, ty: -999, raf: 0, visible: false, label: "", above: false,
    el: null, sq: null, lb: null,
    init() {
      this.el = document.querySelector(".cursor");
      if (!this.el || window.matchMedia("(pointer: coarse)").matches) return;
      this.sq = this.el.querySelector(".cursor-square");
      this.lb = this.el.querySelector(".cursor-label");
      window.addEventListener("pointermove", (e) => {
        this.tx = e.clientX; this.ty = e.clientY;
        if (!this.visible) { this.visible = true; this.el.classList.add("visible"); }
        const t = e.target.closest && e.target.closest("[data-cur]");
        if (t) {
          this.label = t.getAttribute("data-cur");
          this.above = t.hasAttribute("data-cur-above");
        } else if (this.label) { this.label = ""; }
        this.kick();
      }, { passive: true });
      window.addEventListener("pointerleave", () => { this.visible = false; this.el.classList.remove("visible"); });
      document.addEventListener("visibilitychange", () => { if (document.hidden) this.el.classList.remove("visible"); });
    },
    kick() {
      if (this.raf) return;
      const step = () => {
        this.raf = 0;
        const a = Math.pow(0.08, 1 / 60);  // frame-rate independent lag toward the pointer
        const now = performance.now();
        const k = this.last ? clamp((now - this.last) / 16.67, 0.2, 3) : 1;
        this.last = now;
        const f = 1 - Math.pow(1 - 0.08, k);
        this.x += (this.tx - this.x) * f;
        this.y += (this.ty - this.y) * f;
        if (this.el) {
          this.el.style.transform = "translate(" + this.x.toFixed(1) + "px," + this.y.toFixed(1) + "px)";
          if (this.lb) this.lb.textContent = this.label || "";
          this.lb.style.transform = this.above ? "translateY(-150px)" : "";
        }
        if (Math.abs(this.tx - this.x) > 0.2 || Math.abs(this.ty - this.y) > 0.2) this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    },
  };

  /* --------------------------------------------------------- the reveals */

  const reveal = {
    io: null,
    init() {
      const els = document.querySelectorAll(".reveal");
      if (!("IntersectionObserver" in window)) {
        els.forEach((el) => el.classList.add("revealed")); return;
      }
      this.io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (en.isIntersecting) { en.target.classList.add("revealed"); this.io.unobserve(en.target); }
        }
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
      els.forEach((el) => this.io.observe(el));
    },
  };

  /* ------------------------------------------------------------ the reels */

  const reels = {
    live: [], playing: [], io: null, tile: null,
    init() {
      this.live = Array.from(document.querySelectorAll("[data-reel-seed]"));
      if (!this.live.length) return;
      if (!("IntersectionObserver" in window)) return;
      this.io = new IntersectionObserver((es) => {
        for (const e of es) {
          if (e.isIntersecting) this.want(e.target);
          else this.drop(e.target);
        }
      }, { rootMargin: "100% 0px 100% 0px" });
      this.live.forEach((f) => this.io.observe(f));
    },
    want(fig) {
      if (prefersReduced() || saveData()) { this.offer(fig); return; }
      if (fig._reel) { this.play(fig); return; }
      const img = fig.querySelector(".reel-still");
      if (!img || !img.complete || img.naturalWidth === 0) {
        img && img.addEventListener("load", () => this.want(fig), { once: true });
        return;
      }
      this.build(fig);
      this.play(fig);
    },
    offer(fig) {
      const b = fig.querySelector(".reel-play");
      if (b && !fig._offered) {
        fig._offered = true; b.hidden = false;
        b.addEventListener("click", () => { this.build(fig); this.play(fig); b.hidden = true; });
      }
    },
    build(fig) {
      if (fig._reel) return;
      const cv = fig.querySelector(".reel-canvas");
      const img = fig.querySelector(".reel-still");
      if (!cv || !img) return;
      const seed = parseInt(fig.getAttribute("data-reel-seed"), 10) || 1;
      cv.width = Math.min(img.naturalWidth || cv.width, 640);
      cv.height = Math.round(cv.width * (img.naturalHeight || 9) / (img.naturalWidth || 16));
      fig._reel = { ctx: cv.getContext("2d"), img, seed, cv, dir: (seed % 2 ? 1 : -1) };
    },
    play(fig) {
      if (!fig._reel || this.playing.includes(fig)) return;
      this.playing.push(fig);
      fig._reel.cv.classList.add("playing");
      if (this.playing.length === 1) this.frame();
    },
    drop(fig) {
      const i = this.playing.indexOf(fig);
      if (i > -1) { this.playing.splice(i, 1); }
      if (fig._reel) fig._reel.cv.classList.remove("playing");
    },
    frame() {
      if (!this.playing.length) return;
      while (this.playing.length > 2) { const f = this.playing.shift(); f._reel.cv.classList.remove("playing"); }
      const t = performance.now() / 1000;
      for (const fig of this.playing) {
        const r = fig._reel; if (!r) continue;
        const w = r.cv.width, h = r.cv.height, x = r.ctx;
        const phase = ((t / 12) % 1) * (r.dir > 0 ? 1 : -1);
        const off = Math.round(phase * w * 0.06);
        try {
          x.globalAlpha = 1;
          x.filter = "none";
          x.drawImage(r.img, off, 0, w, h);
          x.drawImage(r.img, off - r.dir * w, 0, w, h);
          const lift = 0.04 * Math.sin(t / 12 * 2 * Math.PI);
          x.fillStyle = "rgba(6,4,3," + Math.max(0, -lift).toFixed(3) + ")";
          x.fillRect(0, 0, w, h);
          x.fillStyle = "rgba(233,234,228," + Math.max(0, lift).toFixed(3) + ")";
          x.fillRect(0, 0, w, h);
          this.grain(x, w, h, t);
        } catch (err) { this.drop(fig); }
      }
      requestAnimationFrame(() => this.frame());
    },
    grain(x, w, h, t) {
      if (!this.tileImg) {
        const i = new Image();
        i.src = "/static/grain.png";
        this.tileImg = i;
        return;
      }
      if (!this.tileImg.complete || !this.tileImg.naturalWidth) return;
      x.globalAlpha = 0.05;
      const ox = -Math.floor(((t * 37) % 300)), oy = -Math.floor(((t * 53) % 300));
      for (let yy = oy; yy < h; yy += 300) for (let xx = ox; xx < w; xx += 300) x.drawImage(this.tileImg, xx, yy);
      x.globalAlpha = 1;
    },
  };

  /* --------------------------------------------------- analytics, once */

  function analytics() {
    // counts a page view and nothing else, after the route is interactive
    setTimeout(() => {
      try { fetch("/api/health?view=1", { method: "GET", keepalive: true }).catch(() => {}); } catch (e) {}
    }, 1200);
  }

  /* ------------------------------------------------------------- the frame */

  document.addEventListener("alpine:init", () => {
    window.Alpine.data("frame", () => ({
      route: document.body.dataset.route || "entry",
      leaving: false,
      scrolling: false,
      narrow: false,
      contactOpen: false,
      counter: { visible: false, label: "", value: "", style: {} },
      split(word) {
        if (!word) return "";
        let out = "";
        for (const ch of word) out += '<span class="split-ch" aria-hidden="true">' +
          (ch === " " ? "&nbsp;" : ch) + "</span>";
        return out;
      },
      setCounter(label, value, visible) {
        this.counter = { label, value, visible, style: this.counter.style || {} };
      },
      closeContact() { this.contactOpen = false; this._restoreFocus && this._restoreFocus(); },
      init() {
        window.__frame = this;
        this.route = document.body.dataset.route;
        scroll.init();
        cursor.init();
        reveal.init();
        reels.init();
        this.watcher = setInterval(() => {
          this.scrolling = scroll.inFlight;
        }, 120);
        const mq = matchMedia("(max-width: 767px), (max-height: 499px)");
        const apply = () => { this.narrow = mq.matches; document.body.classList.toggle("narrow", mq.matches); };
        mq.addEventListener ? mq.addEventListener("change", apply) : mq.addListener(apply);
        apply();
        requestAnimationFrame(() => document.body.classList.add("arrived"));
        this.routeClass();
        analytics();
        // the footer arrival on the long routes, and the narrow-width frame
        // retraction, both driven from the one scroll source
        const long = ["works", "work", "about", "talent", "studio", "studio-item"];
        if (long.includes(this.route)) {
          const f = document.querySelector(".footer");
          if (f) scroll.on((y) => {
            const max = scroll.max();
            const start = max * 0.62;
            const t = clamp((y - start) / Math.max(1, max - start), 0, 1);
            f.classList.toggle("arrived", t > 0.12);
          });
        }
        const frame = document.querySelector(".frame");
        if (frame && ["works", "about", "entry"].includes(this.route)) {
          scroll.on((y) => {
            frame.classList.toggle("retracted",
              document.body.classList.contains("narrow") && y > window.innerHeight * 0.5);
          });
        }
      },
      routeClass() {
        const r = this.route;
        document.querySelectorAll(".mark-svg").forEach((m) => { m.style.display = ""; });
      },
      navigate(href) {
        if (this.leaving) return;
        this.leaving = true;
        setTimeout(() => { window.location.href = href; }, 400);
      },
    }));

    window.Alpine.data("entryRoute", () => ({
      progress: { pct: 0, done: false },
      counterStyle: {},
      init() {
        const frame = window.__frame;
        const items = Array.from(document.querySelectorAll(".cluster-img"));
        const total = items.length + 2;   // the chrome, the fonts, the stills; no reels
        let done = 0, creep = 0, tick = 0;
        const paint = () => {
          if (this.progress.done) return;
          const real = Math.round((done / total) * 100);
          this.progress.pct = Math.max(0, Math.min(real, creep, 99));
          if (frame) frame.setCounter("LOADING", this.progress.pct + "%", true);
        };
        const mark = () => {
          done = Math.min(total, done + 1);
          paint();
          if (done >= total) this.finish();
        };
        this.finish = () => {
          if (this.progress.done) return;
          this.progress.done = true;
          this.progress.pct = 100;
          clearInterval(tick);
          this.counterStyle = { transform: "translateX(-50%) translateX(-14.5078px)" };
          if (frame) {
            frame.setCounter("LOADING", "100%", true);
            setTimeout(() => frame.setCounter("", "", false), 900);
          }
        };
        paint();
        tick = setInterval(() => { creep = Math.min(creep + 1, 99); paint(); }, 90);
        (document.fonts ? document.fonts.ready : Promise.resolve()).then(mark).catch(mark);
        mark();                                   // the chrome
        items.forEach((img) => {
          if (img.complete && img.naturalWidth) mark();
          else {
            img.addEventListener("load", mark, { once: true });
            img.addEventListener("error", mark, { once: true });
          }
        });
        setTimeout(() => this.finish(), 9000);    // a loader that never arrives fails quietly
      },
    }));

    window.Alpine.data("worksRoute", () => ({
      opened: false,
      init() { this.opened = !prefersReduced(); },
    }));

    window.Alpine.data("detailRoute", () => ({ init() { reels.init(); } }));

    window.Alpine.data("rosterRoute", () => ({
      active: "", filtered: [], current: 0, announce: "",
      init() {
        const root = this.$el;
        this._rows = Array.from(root.querySelectorAll(".roster-entry"));
        const discs = Array.from(root.querySelectorAll(".filter-btn"))
          .map((b) => b.getAttribute("data-discipline"));
        this.active = discs[0] || "";
        this.apply();
        scroll.on(() => {
          if (!root.isConnected) return;
          if (!document.body.classList.contains("narrow")) return;
          const idx = Math.round(window.scrollY / window.innerHeight);
          const rows = this._rows.filter((el) => el.getAttribute("data-discipline") === this.active);
          if (rows.length) {
            const at = clamp(idx, 0, rows.length - 1);
            if (rows[at] !== rows[this.current]) {
              this.current = at;
              rows.forEach((el, i) => el.classList.toggle("current", i === at));
              this.fitName(); this.count();
            }
          }
        });
      },
      isCurrent(i) { return !!(this._rows && this._rows[i] && this._rows[i].classList.contains("current")); },
      apply() {
        this.filtered = this._rows.filter((el) => el.getAttribute("data-discipline") === this.active);
        this.current = 0;
        this._rows.forEach((el) => el.classList.remove("current"));
        if (this.filtered.length) this.filtered[0].classList.add("current");
        this.fitName();
        this.count();
      },
      choose(d) { this.active = d; this.apply(); },
      advance(dir) {
        const n = this.filtered.length;
        if (!n) return;
        this.current = (this.current + dir + n) % n;
        this.filtered.forEach((el, i) => el.classList.toggle("current", i === this.current));
        this.fitName();
        this.count();
      },
      nameStyle(i) {
        const el = this._rows && this._rows[i];
        return (el && el.dataset.fit) || "";
      },
      fitName() {
        const el = this.filtered[this.current];
        if (!el) return;
        const a = el.querySelector(".roster-name a");
        if (!a) return;
        a.style.fontSize = "";
        const max = Math.min(window.innerWidth * 0.84, 1180);
        let size = 125;
        while (size > 26 && (a.scrollWidth > max || a.getBoundingClientRect().width > max)) {
          size -= 6;
          a.style.fontSize = size + "px";
        }
        el.dataset.fit = a.style.fontSize ? "font-size:" + a.style.fontSize : "";
      },
      count() {
        const frame = window.__frame;
        const n = this.filtered.length;
        const cur = this.filtered[this.current];
        this.announce = cur ? (cur.querySelector(".roster-name").textContent.trim() +
          ", " + cur.getAttribute("data-discipline")) : "";
        if (frame) frame.setCounter("POSITION", (this.current + 1) + " / " + n,
          n > 0 && !document.body.classList.contains("narrow"));
      },
    }));

    window.Alpine.data("authForm", (mode) => ({
      email: "", password: "", error: "", ok: "",
      async submit() {
        this.error = "";
        try {
          const url = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
          const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: this.email, password: this.password }) });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) { this.error = (d.error && d.error.reason) || "That did not work."; return; }
          try { sessionStorage.setItem("cirrus.token", d.token);
                sessionStorage.setItem("cirrus.account", JSON.stringify(d.account)); } catch (e) {}
          if (d.account && d.account.role === "producer") { window.location.href = "/studio"; return; }
          this.ok = "Signed in. A viewer account reads everything public and nothing more.";
          setTimeout(() => { window.location.href = "/"; }, 700);
        } catch (e) { this.error = "The studio did not answer. Try again."; }
      },
    }));

    function authHeaders() {
      let t = "";
      try { t = sessionStorage.getItem("cirrus.token") || ""; } catch (e) {}
      return t ? { "Authorization": "Bearer " + t } : {};
    }

    window.Alpine.data("palette", () => ({
      q: "", items: [], reorder: false, worksOrder: [], notice: "", saving: false,
      init() {
        this.load();
      },
      async load() {
        const r = await fetch("/api/studio/items", { headers: authHeaders() });
        if (r.status === 401 || r.status === 403) { window.location.href = "/studio/login"; return; }
        const d = await r.json();
        this.items = Array.isArray(d) ? d : [];
        this.worksOrder = this.items.filter((i) => i.kind === "work")
          .map((i, ix) => ({ ...i, pos: ix + 1 }));
      },
      match(name) { return !this.q || name.indexOf(this.q.toLowerCase()) > -1; },
      get filtered() {
        const q = (this.q || "").toLowerCase();
        return this.items.filter((i) => !q || i.title.toLowerCase().includes(q) || i.slug.includes(q));
      },
      go(href) { window.location.href = href; },
      move(w, dir) {
        const i = this.worksOrder.indexOf(w);
        const j = i + dir;
        if (j < 0 || j >= this.worksOrder.length) return;
        const arr = this.worksOrder;
        arr.splice(j, 0, arr.splice(i, 1)[0]);
        this.worksOrder = arr.map((x, ix) => ({ ...x, pos: ix + 1 }));
      },
      async saveOrder() {
        this.saving = true; this.notice = "";
        const r = await fetch("/api/studio/works/order", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ ordered_ids: this.worksOrder.map((w) => w.id) }) });
        this.saving = false;
        if (!r.ok) { const d = await r.json().catch(() => ({})); this.notice = (d.error && d.error.reason) || "Not saved."; return; }
        this.notice = "The index carries the new order.";
      },
      async mint(it) {
        const r = await fetch("/api/studio/preview-tokens", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ item_id: it.id }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { this.notice = (d.error && d.error.reason) || "No token."; return; }
        window.open("/preview/" + d.token, "_blank");
      },
      async signout() {
        try { sessionStorage.removeItem("cirrus.token"); sessionStorage.removeItem("cirrus.account"); } catch (e) {}
        await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
        window.location.href = "/";
      },
    }));

    window.Alpine.data("newRecord", (kind) => ({
      title: "", slug: "", discipline: "director", variant: "left", error: "",
      async submit() {
        this.error = "";
        const body = { kind, title: this.title, slug: this.slug || undefined };
        if (kind === "talent") body.discipline = this.discipline; else body.variant = this.variant;
        const r = await fetch("/api/studio/items", { method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { this.error = (d.error && d.error.reason) || "That did not work."; return; }
        window.location.href = "/studio/items/" + d.id;
      },
    }));

    window.Alpine.data("editRecord", (id) => ({
      id, title: "", newSlug: "", discipline: "director", variant: "left", published: false,
      talents: [], media: [], error: "", mError: "", cError: "", notice: "", busy: false,
      mRole: "poster", mAlt: "", mWidth: 598, mHeight: 320, mSeed: "",
      cRole: "Director", cName: "", cTalent: "",
      async init() {
        const r = await fetch("/api/studio/items/" + id, { headers: authHeaders() });
        if (r.status === 401 || r.status === 403) { window.location.href = "/studio/login"; return; }
        if (!r.ok) { window.location.href = "/studio"; return; }
        const d = await r.json();
        this.title = d.title; this.discipline = d.discipline || "director";
        this.variant = d.variant || "left"; this.published = d.published;
        this.media = d.media || [];
        const t = await fetch("/api/studio/items?kind=talent", { headers: authHeaders() });
        if (t.ok) this.talents = await t.json();
      },
      async save() {
        this.error = ""; this.busy = true;
        const body = { title: this.title };
        if (this.newSlug) body.slug = this.newSlug;
        if (this.discipline) body.discipline = this.discipline;
        if (this.variant) body.variant = this.variant;
        let r = await fetch("/api/studio/items/" + id, { method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) });
        let d = await r.json().catch(() => ({}));
        if (!r.ok) { this.busy = false; this.error = (d.error && d.error.reason) || "Not saved."; return; }
        if (this.newSlug && d.slug && this.newSlug !== d.slug) {
          this.error = "The title is saved; the slug did not change.";
          this.busy = false; return;
        }
        this.newSlug = "";
        if (this.newSlug === "") { this.busy = false; this.notice = "Saved."; return; }
      },
      async addMedia() {
        this.mError = "";
        const body = { role: this.mRole, alt: this.mAlt, width: this.mWidth, height: this.mHeight };
        if (this.mSeed !== "" && this.mSeed !== null) body.seed = this.mSeed;
        const r = await fetch(`/api/studio/items/${id}/media`, { method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { this.mError = (d.error && d.error.reason) || "Not attached."; return; }
        this.media.push(d); this.mAlt = ""; this.mSeed = "";
        window.location.reload();
      },
      async addCredit() {
        this.cError = "";
        const body = { role: this.cRole, name: this.cName };
        if (this.cTalent) body.talent_id = this.cTalent;
        const r = await fetch(`/api/studio/items/${id}/credits`, { method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { this.cError = (d.error && d.error.reason) || "Not added."; return; }
        window.location.reload();
      },
      async publish(want) {
        this.error = ""; this.busy = true;
        const r = await fetch(`/api/studio/items/${id}/publish`, { method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ published: want }) });
        const d = await r.json().catch(() => ({}));
        this.busy = false;
        if (!r.ok) { this.error = (d.error && d.error.reason) || "Not published."; return; }
        if (want) { window.location.href = `/studio/items/${id}/published`; return; }
        this.published = false; this.notice = "Unlisted. It is absent from every public read.";
      },
      async mint() {
        this.notice = "";
        const r = await fetch("/api/studio/preview-tokens", { method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ item_id: String(id) }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { this.notice = (d.error && d.error.reason) || "No token."; return; }
        window.open("/preview/" + d.token, "_blank");
      },
    }));
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (!window.Alpine) {
      // Alpine failed to load: the document stands on its own.
      document.querySelectorAll(".reveal").forEach((el) => el.classList.add("revealed"));
      document.querySelectorAll(".entry-cluster").forEach((el) => el.classList.add("ready"));
      document.querySelectorAll(".entry-veil").forEach((el) => el.classList.add("gone"));
      document.querySelectorAll(".opening-line").forEach((el) => el.classList.add("sharp"));
    }
  });
})();
