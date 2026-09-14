/* Cirrus front end: the rendered document's behaviour and nothing else. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var coarse = window.matchMedia("(pointer: coarse)");

  function token() {
    try { return localStorage.getItem("cirrus_token") || ""; } catch (e) { return ""; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem("cirrus_token", t) : localStorage.removeItem("cirrus_token"); } catch (e) {}
    document.cookie = t ? "cirrus_token=" + t + "; path=/; samesite=lax"
                        : "cirrus_token=; path=/; max-age=0";
  }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    var t = token();
    if (t) opts.headers["Authorization"] = "Bearer " + t;
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { setToken(""); }
      return r.json().then(function (body) { return { ok: r.ok, status: r.status, body: body }; })
        .catch(function () { return { ok: r.ok, status: r.status, body: {} }; });
    });
  }
  window.cirrusAPI = api;
  window.cirrusToken = { get: token, set: setToken };

  /* ---------- the one scroll source ---------- */
  var effects = [];
  var scrollY = window.scrollY;
  var smoothTarget = window.scrollY;
  var smoothCurrent = window.scrollY;
  var smoothing = !reduceMotion.matches;
  var flightTimer = null;
  var wheelActive = false;

  function register(effect) { effects.push(effect); effect(scrollY, window.innerHeight); }

  function runEffects() {
    var h = window.innerHeight;
    for (var i = 0; i < effects.length; i++) effects[i](window.scrollY, h);
  }

  function flagFlight() {
    document.documentElement.classList.add("is-scrolling");
    if (flightTimer) window.clearTimeout(flightTimer);
    flightTimer = window.setTimeout(function () {
      document.documentElement.classList.remove("is-scrolling");
    }, 160);
  }

  window.addEventListener("wheel", function (e) {
    if (!smoothing || e.ctrlKey) return;
    if (e.deltaMode === 1) { wheelActive = false; return; }
    if (e.defaultPrevented) return;
    var root = document.scrollingElement;
    if (!root) return;
    var max = root.scrollHeight - window.innerHeight;
    var next = Math.max(0, Math.min(max, smoothTarget + e.deltaY));
    if (next === smoothCurrent && (smoothCurrent === 0 || smoothCurrent === max)) return;
    wheelActive = true;
    smoothTarget = next;
    flagFlight();
    e.preventDefault();
  }, { passive: false });

  window.addEventListener("pointerdown", function () { wheelActive = false; });
  window.addEventListener("keydown", function (e) {
    var keys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Page"];
    if (keys.indexOf(e.key) >= 0) wheelActive = false;
  });

  var raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function (f) { return setTimeout(f, 16); };
  function tick(now) {
    if (smoothing && wheelActive) {
      var k = 1 - Math.pow(1 - 0.14, Math.max(1, now - (tick.last || now)) / 16.67);
      smoothCurrent += (smoothTarget - smoothCurrent) * k;
      if (Math.abs(smoothTarget - smoothCurrent) < 0.4) smoothCurrent = smoothTarget;
      window.scrollTo(0, smoothCurrent);
      scrollY = smoothCurrent;
      runEffects();
    } else {
      smoothTarget = smoothCurrent = window.scrollY;
      if (scrollY !== window.scrollY) { scrollY = window.scrollY; runEffects(); }
    }
    tick.last = now;
    raf(tick);
  }
  raf(tick);
  window.addEventListener("resize", runEffects);
  window.addEventListener("scroll", function () {
    if (!wheelActive) { scrollY = window.scrollY; runEffects(); }
  }, { passive: true });
  window.cirrusScroll = { register: register, run: runEffects };

  /* ---------- reveals, blur, footer ---------- */
  function bootEffects() {
    var reveals = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
    reveals.forEach(function (el) {
      register(function (y, h) {
        var box = el.getBoundingClientRect();
        if (box.top < h * 0.92) el.classList.add("is-in");
      });
    });

    var blurs = Array.prototype.slice.call(document.querySelectorAll("[data-blur-block]"));
    if (!reduceMotion.matches && window.matchMedia("(min-width: 769px) and (min-height: 501px)").matches) {
      blurs.forEach(function (el) {
        el.classList.add("blur-block");
        register(function () {
          var box = el.getBoundingClientRect();
          var centre = box.top + box.height / 2;
          var d = Math.abs(centre - window.innerHeight / 2) / window.innerHeight;
          var radius = Math.max(0, Math.min(10, d * 2 * 10));
          el.style.filter = "blur(" + radius.toFixed(2) + "px)";
        });
      });
    } else {
      blurs.forEach(function (el) { el.style.filter = "none"; });
    }

    var footer = document.querySelector("[data-footer]");
    if (footer) {
      var inner = footer.querySelector(".footer-cols");
      var last = window.scrollY;
      register(function (y, h) {
        var max = document.scrollingElement.scrollHeight - h;
        if (max <= 0) return;
        var p = Math.max(0, Math.min(1, (y - (max - h * 1.5)) / (h * 1.5)));
        var travel = 249.506 * (1 - p);
        inner.style.transform = "translateY(" + travel.toFixed(1) + "px)";
        inner.style.opacity = String(0.2 + 0.8 * p);
      });
    }

    var frame = document.querySelector(".frame");
    if (frame && window.matchMedia("(max-width: 768px), (max-height: 500px)").matches) {
      var lastY = 0;
      register(function (y) {
        if (y > lastY + 24 && y > 120) frame.classList.add("is-retracted");
        else if (y < lastY - 24) frame.classList.remove("is-retracted");
        lastY = y;
      });
    }
  }
  document.addEventListener("DOMContentLoaded", bootEffects);
  if (document.readyState !== "loading") bootEffects();
  window.cirrusBoot = bootEffects;

  /* ---------- the entry counter, the cursor pair, the chrome ---------- */
  function trackProgress(onDone) {
    var settled = 0, total = 0, done = false;
    var fonts = document.fonts ? Array.prototype.slice.call(document.fonts) : [];
    total += 2;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { settle(); settle(); });
    } else { settle(); settle(); }
    var imgs = Array.prototype.slice.call(document.querySelectorAll(".cluster-img"));
    total += imgs.length;
    imgs.forEach(function (img) {
      if (img.complete && img.naturalWidth) settle();
      else {
        img.addEventListener("load", settle, { once: true });
        img.addEventListener("error", settle, { once: true });
      }
    });
    window.setTimeout(function () {
      while (settled < total) settle();
    }, 6000);
    function settle() {
      settled++;
      onDone(Math.min(1, total ? settled / total : 1));
      if (settled >= total && !done) { done = true; onDone(1); }
    }
  }

  document.addEventListener("alpine:init", function () {
    Alpine.data("site", function (opts) {
      opts = opts || {};
      return {
        leaving: false,
        contactOpen: false,
        coarse: coarse.matches,
        counterOn: opts.route === "home",
        counterDone: false,
        counterValue: "0",
        counterMark: "%",
        cursorOn: false,
        cursorLabel: "",
        house: opts.house || { contact_email: "prod@example.com" },
        px: -999, py: -999, cx: -999, cy: -999, rafId: null,
        init() {
          var self = this;
          this.splitLabels();
          if (opts.route === "home") this.runCounter();
          document.addEventListener("pointermove", function (e) { self.trackCursor(e); });
          document.addEventListener("pointerover", function (e) { self.readLabel(e); });
          document.addEventListener("pointerout", function (e) { self.clearLabel(e); });
          document.addEventListener("keydown", function (e) {
            if (e.key !== "Tab") return;
            self.cursorOn = false;
          });
          this.tickCursor();
          this.bindNav();
          if (window.matchMedia("(max-width: 768px), (max-height: 500px)").matches) {
            var contact = document.querySelector(".nav-contact");
            if (contact) contact.addEventListener("click", function (e) {
              e.preventDefault(); self.openContact();
            });
          }
        },
        runCounter() {
          var self = this;
          this.counterOn = true;
          this.counterValue = "0";
          trackProgress(function (p) {
            var shown = Math.round(p * 100);
            self.counterValue = String(shown);
            var el = document.querySelector(".counter-well");
            if (el) {
              var width = el.getBoundingClientRect().width / 2;
              el.style.setProperty("--counter-shift", (-width).toFixed(3) + "px");
            }
            if (p >= 1) {
              self.counterValue = "100";
              window.setTimeout(function () {
                self.counterDone = true;
                self.counterOn = false;
                self.entranceStagger();
              }, 260);
            }
          });
        },
        entranceStagger() {
          var labels = document.querySelectorAll(".split-label .ch");
          Array.prototype.forEach.call(labels, function (ch, i) {
            ch.style.transitionDelay = (i * 18) + "ms";
            ch.classList.add("is-arrived");
          });
          var tiles = document.querySelectorAll(".cluster-tile");
          Array.prototype.forEach.call(tiles, function (t, i) {
            t.style.transitionDelay = (i * 20) + "ms";
            t.classList.add("is-settled");
          });
        },
        splitLabels() {
          var labels = document.querySelectorAll(".split-label");
          Array.prototype.forEach.call(labels, function (el) {
            var text = el.textContent;
            el.setAttribute("aria-label", text.trim());
            var frag = document.createDocumentFragment();
            for (var i = 0; i < text.length; i++) {
              var s = document.createElement("span");
              s.className = "ch";
              s.setAttribute("aria-hidden", "true");
              s.textContent = text[i] === " " ? "\u00a0" : text[i];
              frag.appendChild(s);
            }
            el.textContent = "";
            el.appendChild(frag);
          });
        },
        bindNav() {
          var self = this;
          var links = document.querySelectorAll("a[href^='/']");
          Array.prototype.forEach.call(links, function (a) {
            a.addEventListener("click", function (e) {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              var href = a.getAttribute("href");
              if (!href || href.startsWith("#")) return;
              e.preventDefault();
              self.navigate(href);
            });
          });
        },
        navigate(href) {
          var self = this;
          if (reduceMotion.matches) { window.location.assign(href); return; }
          this.leaving = true;
          var veil = document.querySelector(".route-veil");
          if (veil) veil.classList.add("is-on");
          window.setTimeout(function () { window.location.assign(href); }, 380);
        },
        openContact() {
          this.contactOpen = true;
          this.lastFocus = document.activeElement;
          var overlay = document.querySelector(".contact-overlay");
          window.setTimeout(function () {
            var c = overlay && overlay.querySelector(".contact-close");
            if (c) c.focus();
          }, 30);
        },
        closeContact() {
          this.contactOpen = false;
          if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
        },
        trackCursor(e) {
          this.px = e.clientX; this.py = e.clientY;
          if (!this.cursorOn) { this.cx = e.clientX; this.cy = e.clientY; this.cursorOn = true; }
          var host = e.target.closest && e.target.closest(".media-holder");
          if (host && this.lastHost !== host) { this.lastHost = host; }
        },
        readLabel(e) {
          var t = e.target.closest && e.target.closest("[data-cursor-label]");
          if (!t) return;
          this.cursorLabel = t.getAttribute("data-cursor-label");
        },
        clearLabel(e) {
          var t = e.target.closest && e.target.closest("[data-cursor-label]");
          if (!t) return;
          if (this.cursorLabel === t.getAttribute("data-cursor-label")) this.cursorLabel = "";
        },
        tickCursor() {
          var self = this;
          var k = 0.08;
          function frame() {
            self.cx += (self.px - self.cx) * k;
            self.cy += (self.py - self.cy) * k;
            var pair = document.querySelector(".cursor-pair");
            if (pair && !coarse.matches) {
              pair.style.transform = "translate(" + self.cx.toFixed(2) + "px, " + self.cy.toFixed(2) + "px)";
            }
            self.rafId = window.requestAnimationFrame(frame);
          }
          if (!coarse.matches && !reduceMotion.matches) frame();
        },
      };
    });

    Alpine.data("roster", function (opts) {
      var entries = (opts && opts.entries) || [];
      var disciplines = (opts && opts.disciplines) || [];
      var first = disciplines[0] || "";
      return {
        entries: entries,
        disciplines: disciplines,
        active: first,
        index: 0,
        announce: "",
        init() {
          var self = this;
          this.$watch("active", function () { self.index = 0; });
          window.addEventListener("wheel", function (e) {
            if (window.innerWidth <= 768 || window.innerHeight <= 500) return;
            if (e.defaultPrevented) return;
            var tag = (e.target && e.target.closest) ? e.target.closest(".roster, input, textarea") : null;
            if (!tag) return;
            e.preventDefault();
            self.advance(e.deltaY > 0 ? 1 : -1);
          }, { passive: false });
        },
        get filtered() {
          var a = this.active;
          return this.entries.filter(function (t) { return t.discipline === a; });
        },
        get positionLabel() {
          var n = this.filtered.length;
          return (n ? this.index + 1 : 0) + " / " + n;
        },
        choose(d) { this.active = d; this.index = 0; },
        advance(step) {
          var n = this.filtered.length;
          if (!n) return;
          this.index = (this.index + step + n) % n;
          this.announce = this.filtered[this.index].title;
        },
        isCurrent(i) {
          var cur = this.filtered[this.index];
          return !!cur && cur.id === this.entries[i].id;
        },
        nameShift(i) {
          var el = document.querySelectorAll(".roster-entry")[i];
          if (!el) return 0;
          var name = el.querySelector(".roster-name");
          if (!name) return 0;
          var w = name.scrollWidth;
          var room = window.innerWidth - 80;
          if (w <= room) return 0;
          return -((w - room) / 2);
        },
      };
    });

    Alpine.data("authForm", function (opts) {
      return {
        email: "", password: "", busy: false, error: "", ok: "",
        endpoint: opts.endpoint, next: opts.next || "/studio",
        async submit() {
          this.busy = true; this.error = "";
          var res = await api(this.endpoint, {
            method: "POST",
            body: JSON.stringify({ email: this.email, password: this.password })
          });
          this.busy = false;
          if (!res.ok) { this.error = (res.body && res.body.error) || "That was refused."; return; }
          setToken(res.body.token);
          var acct = res.body.account || {};
          if (acct.role !== "producer") { window.location.assign("/"); return; }
          window.location.assign(this.next && this.next.startsWith("/studio") ? this.next : "/studio");
        }
      };
    });

    Alpine.data("itemForm", function (opts) {
      return {
        kind: opts.kind, title: "", slug: "", discipline: "director", variant: "left",
        busy: false, error: "",
        async create() {
          this.busy = true; this.error = "";
          var body = { kind: this.kind, title: this.title };
          if (this.slug) body.slug = this.slug;
          if (this.kind === "talent") body.discipline = this.discipline;
          else body.variant = this.variant;
          var res = await api("/api/studio/items", { method: "POST", body: JSON.stringify(body) });
          this.busy = false;
          if (!res.ok) { this.error = (res.body && res.body.error) || "That was refused."; return; }
          window.location.assign("/studio/items/" + res.body.id);
        }
      };
    });

    Alpine.data("editForm", function (opts) {
      var item = opts.item || {};
      return {
        title: item.title || "", slug: item.slug || "",
        discipline: item.discipline || "director", variant: item.variant || "left",
        busy: false, error: "", ok: "",
        async save() {
          this.busy = true; this.error = ""; this.ok = "";
          var body = { title: this.title };
          if (item.kind === "talent") body.discipline = this.discipline;
          else body.variant = this.variant;
          var res = await api("/api/studio/items/" + item.id, {
            method: "PATCH", body: JSON.stringify(body)
          });
          if (res.ok && this.slug && this.slug !== item.slug) {
            res = await api("/api/studio/items/" + item.id + "/slug", {
              method: "POST", body: JSON.stringify({ slug: this.slug })
            });
          }
          this.busy = false;
          if (!res.ok) { this.error = (res.body && res.body.error) || "That was refused."; return; }
          this.ok = "Saved.";
          if (res.body && res.body.slug && res.body.slug !== item.slug) {
            window.setTimeout(function () {
              window.location.assign("/studio/items/" + item.id);
            }, 400);
          }
        }
      };
    });

    Alpine.data("mediaForm", function (opts) {
      return {
        media: [], role: "poster", seed: "", width: 598, height: 320, alt: "",
        busy: false, error: "",
        async init() {
          var res = await api("/api/studio/items/" + opts.itemId);
          this.media = (res.body && res.body.media) || [];
        },
        async add() {
          this.busy = true; this.error = "";
          var res = await api("/api/studio/items/" + opts.itemId + "/media", {
            method: "POST",
            body: JSON.stringify({
              role: this.role, seed: this.seed, width: this.width,
              height: this.height, alt: this.alt
            })
          });
          this.busy = false;
          if (!res.ok) { this.error = (res.body && res.body.error) || "That was refused."; return; }
          var again = await api("/api/studio/items/" + opts.itemId);
          this.media = (again.body && again.body.media) || [];
          this.alt = "";
        }
      };
    });

    Alpine.data("creditsForm", function (opts) {
      return {
        credits: [], talents: opts.talents || [], role: "Director", name: "", talent: "",
        busy: false, error: "",
        async init() {
          var res = await api("/api/studio/items/" + opts.itemId);
          this.credits = (res.body && res.body.credits) || [];
        },
        async add() {
          this.busy = true; this.error = "";
          var body = { role: this.role, name: this.name };
          if (this.talent) body.talent_id = this.talent;
          var res = await api("/api/studio/items/" + opts.itemId + "/credits", {
            method: "POST", body: JSON.stringify(body)
          });
          this.busy = false;
          if (!res.ok) { this.error = (res.body && res.body.error) || "That was refused."; return; }
          var again = await api("/api/studio/items/" + opts.itemId);
          this.credits = (again.body && again.body.credits) || [];
          this.name = "";
        }
      };
    });

    Alpine.data("publishForm", function (opts) {
      return {
        published: opts.published, busy: false, error: "",
        previewHref: "", previewHint: "",
        async setPublished(on) {
          this.busy = true; this.error = "";
          var res = await api("/api/studio/items/" + opts.itemId + "/publish", {
            method: "POST", body: JSON.stringify({ published: on })
          });
          this.busy = false;
          if (!res.ok) { this.error = (res.body && res.body.error) || "That was refused."; return; }
          if (on) window.location.assign("/studio/items/" + opts.itemId + "/published");
          else this.published = false;
        },
        async mint() {
          this.busy = true; this.error = "";
          var res = await api("/api/studio/preview-tokens", {
            method: "POST", body: JSON.stringify({ item_id: opts.itemId })
          });
          this.busy = false;
          if (!res.ok) { this.error = (res.body && res.body.error) || "That was refused."; return; }
          this.previewHref = "/preview/" + res.body.token;
          this.previewHint = "This token expires at " + String(res.body.expires_at).replace("T", " ").slice(0, 19) + " UTC.";
        }
      };
    });

    Alpine.data("studio", function (opts) {
      var records = (opts && opts.records) || [];
      return {
        records: records, query: "", selected: 0,
        reordering: false, reorderOk: "",
        get works() {
          return this.records.filter(function (r) { return r.kind === "work"; });
        },
        get options() {
          var q = this.query.trim().toLowerCase();
          var acts = [
            { key: "a:new-talent", kind: "action", title: "New talent", meta: "create", href: "/studio/talents/new" },
            { key: "a:new-work", kind: "action", title: "New work", meta: "create", href: "/studio/works/new" },
            { key: "a:reorder", kind: "action", title: "Reorder index", meta: "order", href: "/studio?reorder=1" },
            { key: "a:preview", kind: "action", title: "Preview", meta: "mint a token", href: "" }
          ];
          var list = records.map(function (r) {
            return {
              key: "r:" + r.id, kind: r.kind, title: r.title, meta: r.slug + " · " + (r.published ? "live" : "unlisted"),
              href: "/studio/items/" + r.id, id: r.id, published: r.published
            };
          });
          var all = acts.concat(list);
          if (!q) return all.slice(0, 8);
          return all.filter(function (o) {
            return o.title.toLowerCase().indexOf(q) >= 0 || (o.meta || "").toLowerCase().indexOf(q) >= 0;
          }).slice(0, 10);
        },
        init() {
          var self = this;
          var input = document.querySelector("[data-palette-input]");
          if (input) input.focus();
          this.$watch("options", function () { self.selected = 0; });
        },
        go(opt) {
          if (!opt) return;
          if (opt.key === "a:preview") { this.mintForSelection(); return; }
          if (opt.href) window.location.assign(opt.href);
        },
        async mintForSelection() {
          var opt = this.options[this.selected];
          var record = opt && opt.id ? opt : this.records[0];
          if (!record) return;
          var res = await api("/api/studio/preview-tokens", {
            method: "POST", body: JSON.stringify({ item_id: record.id })
          });
          if (res.ok) window.location.assign("/preview/" + res.body.token);
        },
        newTalent() { window.location.assign("/studio/talents/new"); },
        newWork() { window.location.assign("/studio/works/new"); },
        reorder() { this.reordering = !this.reordering; },
        async move(i, step) {
          var ids = this.works.map(function (w) { return w.id; });
          var j = i + step;
          if (j < 0 || j >= ids.length) return;
          var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
          var res = await api("/api/studio/works/order", {
            method: "POST", body: JSON.stringify({ ordered_ids: ids })
          });
          if (!res.ok) { this.reorderOk = (res.body && res.body.error) || "That was refused."; return; }
          this.records = res.body;
          this.reorderOk = "The index is saved.";
        },
        async preview(r) {
          var res = await api("/api/studio/preview-tokens", {
            method: "POST", body: JSON.stringify({ item_id: r.id })
          });
          if (res.ok) window.location.assign("/preview/" + res.body.token);
        },
        onKeydown(e) {
          if (e.key === "ArrowDown") { this.selected = Math.min(this.selected + 1, this.options.length - 1); e.preventDefault(); }
          else if (e.key === "ArrowUp") { this.selected = Math.max(this.selected - 1, 0); e.preventDefault(); }
          else if (e.key === "Enter") { this.go(this.options[this.selected]); e.preventDefault(); }
        }
      };
    });
  });

  /* ---------- the media layer: reels drawn, never decoded ---------- */
  var running = [];
  var MAX_RUNNING = 2;
  var connection = navigator.connection || {};
  var saveData = !!connection.saveData;
  var metered = connection.effectiveType === "slow-2g" || connection.effectiveType === "2g";
  var reelsAllowed = !reduceMotion.matches && !saveData && !metered;

  function fieldFor(seed) {
    var h = 0;
    for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
    return {
      axis: (h & 1) ? "x" : "y",
      dir: (h & 2) ? 1 : -1,
      phase: ((h >> 2) & 255) / 255
    };
  }

  function drawReel(canvas, img, field, t) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    var cycle = (t / 12000) % 1;
    var brightness = 1 + 0.04 * Math.sin((t / 12000) * Math.PI * 2 + field.phase * 6.28);
    var shift = Math.sin(cycle * Math.PI * 2 + field.phase * 6.28) * 18 * field.dir;
    try {
      ctx.filter = "brightness(" + brightness.toFixed(3) + ")";
      if (field.axis === "x") ctx.drawImage(img, -9 + shift * 0.5, 0, w + 18, h);
      else ctx.drawImage(img, 0, -9 + shift * 0.5, w, h + 18);
      ctx.filter = "none";
    } catch (e) { /* the still is already under the canvas */ }
  }

  function bootReels() {
    var holders = Array.prototype.slice.call(document.querySelectorAll("[data-reel]"));
    if (!holders.length) return;
    holders.forEach(function (holder) {
      var mediaId = holder.getAttribute("data-reel");
      var img = holder.querySelector("img");
      var canvas = document.createElement("canvas");
      var play = null;
      var state = { holder: holder, canvas: canvas, img: img, field: null, raf: 0, live: false, t0: 0 };

      function ready() {
        if (!img || !img.complete || !img.naturalWidth) return false;
        return true;
      }

      function start() {
        if (!reelsAllowed || state.live || !ready()) return;
        if (running.length >= MAX_RUNNING) return;
        canvas.className = "reel-canvas";
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        if (!holder.querySelector(".reel-canvas")) holder.appendChild(canvas);
        state.field = fieldFor(mediaId);
        state.live = true;
        state.t0 = performance.now();
        running.push(state);
        loop();
      }

      function loop() {
        if (!state.live) return;
        if (running.indexOf(state) >= MAX_RUNNING - 1 || true) {
          drawReel(canvas, img, state.field, performance.now() - state.t0);
        }
        state.raf = window.requestAnimationFrame(loop);
      }

      function stop() {
        if (!state.live) return;
        state.live = false;
        if (state.raf) window.cancelAnimationFrame(state.raf);
        var i = running.indexOf(state);
        if (i >= 0) running.splice(i, 1);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }

      if (!reelsAllowed) {
        play = document.createElement("button");
        play.className = "reel-play";
        play.type = "button";
        play.textContent = "Play";
        play.setAttribute("aria-label", "Play the moving image");
        play.addEventListener("click", function () {
          reelsAllowed = true;
          start();
          play.remove();
        });
        holder.appendChild(play);
        return;
      }

      var near = false;
      register(function () {
        var box = holder.getBoundingClientRect();
        var wasNear = near;
        near = box.top < window.innerHeight * 2 && box.bottom > -window.innerHeight * 2;
        if (near && !wasNear) start();
        if (!near && wasNear) stop();
      });
    });
  }
  document.addEventListener("DOMContentLoaded", bootReels);
  if (document.readyState !== "loading") bootReels();

  /* ---------- analytics: page views, once interactive, failing quietly ---------- */
  window.addEventListener("load", function () {
    try {
      var key = "cirrus_views";
      var n = parseInt(localStorage.getItem(key) || "0", 10) || 0;
      localStorage.setItem(key, String(n + 1));
    } catch (e) { /* nothing is written where nothing is permitted */ }
  });
})();
