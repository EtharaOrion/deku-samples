/* Cirrus front end: the rendered document's behaviour and nothing else.
   The server decides who may see a record; this file only presents. */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var coarse = window.matchMedia("(hover: none), (pointer: coarse)");
  var narrow = window.matchMedia("(max-width: 768px), (max-height: 500px)");

  function prefersReduced() { return reduced.matches; }

  /* ---------------------------------------------------------- one scroll source */
  var scrollState = { y: window.scrollY, target: window.scrollY, inFlight: false };
  var effects = [];
  var raf = null;
  var lastT = 0;

  function register(effect) { effects.push(effect); }

  function runEffects() {
    for (var i = 0; i < effects.length; i++) {
      try { effects[i](scrollState.y); } catch (e) { /* an effect never takes the page down */ }
    }
  }

  function step(ts) {
    var dt = Math.min(64, ts - lastT || 16);
    lastT = ts;
    if (prefersReduced()) {
      scrollState.target = window.scrollY;
      scrollState.y = scrollState.target;
    } else {
      scrollState.y += (scrollState.target - scrollState.y) * Math.min(1, dt / 1000 * 9);
      if (Math.abs(scrollState.target - scrollState.y) < 0.4) scrollState.y = scrollState.target;
    }
    var flying = scrollState.y !== scrollState.target;
    if (flying !== scrollState.inFlight) {
      scrollState.inFlight = flying;
      root.classList.toggle("is-scrolling", flying);
    }
    runEffects();
    if (flying) {
      raf = requestAnimationFrame(step);
    } else {
      raf = null;
    }
  }

  function wake() {
    if (raf === null) { lastT = 0; raf = requestAnimationFrame(step); }
  }

  var wheeling = false;
  window.addEventListener(
    "wheel",
    function (e) {
      if (prefersReduced() || e.ctrlKey) return;
      var max = root.scrollHeight - window.innerHeight;
      var next = Math.max(0, Math.min(max, scrollState.target + e.deltaY));
      if (next === scrollState.target && (scrollState.target === 0 || scrollState.target === max)) {
        if ((e.deltaY < 0 && window.scrollY <= 0) || (e.deltaY > 0 && window.scrollY >= max)) return;
      }
      e.preventDefault();
      scrollState.target = next;
      window.scrollTo(0, scrollState.y);
      wheeling = true;
      wake();
    },
    { passive: false }
  );
  window.addEventListener("scroll", function () {
    if (wheeling) { wheeling = false; return; }
    scrollState.target = window.scrollY;
    scrollState.y = window.scrollY;
    wake();
  }, { passive: true });

  /* ---------------------------------------------------------- the cursor pair */
  var cursor = { x: -999, y: -999, tx: -999, ty: -999, label: "", shown: false };
  var cursorRaf = null;
  var cursorLast = 0;

  function cursorStep(ts) {
    var dt = Math.min(64, ts - cursorLast || 16);
    var k = 1 - Math.pow(1 - 0.08, dt / (1000 / 60));
    cursor.x += (cursor.tx - cursor.x) * k;
    cursor.y += (cursor.ty - cursor.y) * k;
    var pair = doc.querySelector(".cursor-pair");
    if (pair) pair.style.transform = "translate(" + cursor.x.toFixed(2) + "px," + cursor.y.toFixed(2) + "px)";
    if (Math.abs(cursor.tx - cursor.x) > 0.2 || Math.abs(cursor.ty - cursor.y) > 0.2) {
      cursorRaf = requestAnimationFrame(cursorStep);
    } else {
      cursorRaf = null;
    }
    cursorLast = ts;
  }

  function wakeCursor() {
    if (cursorRaf === null) { cursorLast = 0; cursorRaf = requestAnimationFrame(cursorStep); }
  }

  if (!coarse.matches && !prefersReduced()) {
    doc.addEventListener(
      "pointermove",
      function (e) {
        cursor.tx = e.clientX;
        cursor.ty = e.clientY;
        var pair = doc.querySelector(".cursor-pair");
        var label = doc.querySelector(".cursor-label");
        var square = doc.querySelector(".cursor-square");
        if (!pair) return;
        if (!cursor.shown) { cursor.x = e.clientX; cursor.y = e.clientY; cursor.shown = true; pair.removeAttribute("data-parked"); }
        var hit = e.target.closest ? e.target.closest("[data-cursor-label], a, button") : null;
        var suppress = e.target.closest ? e.target.closest("[data-cursor='none']") : null;
        if (hit && hit.getAttribute("data-cursor-label") && !suppress) {
          label.textContent = hit.getAttribute("data-cursor-label");
        } else if (hit && !suppress) {
          label.textContent = hit.textContent.trim().slice(0, 40);
        } else {
          label.textContent = "";
        }
        if (square) square.style.opacity = suppress ? "0" : "1";
        wakeCursor();
      },
      { passive: true }
    );
  }

  /* ---------------------------------------------------------- letter splitting */
  function splitLetters(el) {
    if (!el || el.dataset.split === "done") return;
    var text = el.textContent;
    el.setAttribute("aria-label", text);
    el.textContent = "";
    text.split("").forEach(function (ch, i) {
      var span = doc.createElement("span");
      span.className = "letter";
      span.setAttribute("aria-hidden", "true");
      span.textContent = ch === " " ? "\u00a0" : ch;
      span.style.display = "inline-block";
      if (!prefersReduced()) {
        span.style.transform = "translateY(14px)";
        span.style.opacity = "0";
        span.style.transition = "transform 0.45s cubic-bezier(.83,.12,.35,.96), opacity 0.3s";
        span.style.transitionDelay = (i * 32) + "ms";
      }
      el.appendChild(span);
    });
    el.dataset.split = "done";
    if (!prefersReduced()) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.querySelectorAll(".letter").forEach(function (s) {
            s.style.transform = "translateY(0)";
            s.style.opacity = "1";
          });
        });
      });
    }
  }

  /* ---------------------------------------------------------- reveals */
  function setupReveals() {
    var tiles = doc.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      tiles.forEach(function (t) { t.style.setProperty("--reveal", "1"); t.classList.add("is-colour"); });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var el = entry.target;
            var start = performance.now();
            var dur = prefersReduced() ? 0 : 800;
            function tick(now) {
              var p = dur === 0 ? 1 : Math.min(1, (now - start) / dur);
              var eased = 1 - Math.pow(1 - p, 3);
              el.style.setProperty("--reveal", eased.toFixed(4));
              if (p < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
            io.unobserve(el);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    tiles.forEach(function (t) {
      if (prefersReduced()) { t.style.setProperty("--reveal", "1"); t.classList.add("is-colour"); return; }
      io.observe(t);
    });
    if (narrow.matches) {
      doc.querySelectorAll(".work-still").forEach(function (img) {
        (img.closest(".media-tile") || img).classList.add("is-colour");
      });
    }
  }

  /* ---------------------------------------------------------- the blur blocks */
  function setupBlur() {
    var blocks = doc.querySelectorAll("[data-blur-block]");
    if (!blocks.length) return;
    if (narrow.matches || prefersReduced()) {
      blocks.forEach(function (b) { b.style.setProperty("--blur", "0px"); b.classList.add("is-sharp"); });
      return;
    }
    register(function (y) {
      var mid = y + window.innerHeight / 2;
      blocks.forEach(function (b) {
        var rect = b.getBoundingClientRect();
        var centre = rect.top + y + rect.height / 2;
        var dist = mid - centre;
        var p = Math.max(0, Math.min(1, 1 - Math.abs(dist) / window.innerHeight));
        var radius = 10 * (1 - p);
        b.style.setProperty("--blur", radius.toFixed(2) + "px");
        b.style.opacity = (0.5 + 0.5 * p).toFixed(3);
      });
    });
    var opening = doc.querySelector(".works-opening");
    if (opening) {
      var started = false;
      register(function (y) {
        if (!started && y > 4) { started = true; opening.classList.add("is-sharp"); }
        if (started && y <= 4) { started = false; opening.classList.remove("is-sharp"); }
      });
      if (window.scrollY < 4) setTimeout(function () { opening.classList.add("is-sharp"); }, 260);
    }
  }

  /* ---------------------------------------------------------- the footer arrival */
  function setupFooter() {
    var footer = doc.querySelector(".footer");
    if (!footer) return;
    register(function (y) {
      var max = root.scrollHeight - window.innerHeight;
      if (max <= 0) { footer.style.setProperty("--footer-progress", "0"); footer.style.setProperty("--footer-fade", "0"); return; }
      var p = Math.max(0, Math.min(1, (y - max * 0.62) / (max * 0.38)));
      footer.style.setProperty("--footer-progress", (1 - p).toFixed(4));
      footer.style.setProperty("--footer-fade", p.toFixed(4));
      if (p >= 0.98) footer.setAttribute("data-arrived", ""); else footer.removeAttribute("data-arrived");
    });
  }

  /* ---------------------------------------------------------- frame retraction */
  function setupRetraction() {
    var frame = doc.querySelector(".frame");
    if (!frame) return;
    if (!narrow.matches) return;
    var on = false;
    window.addEventListener("scroll", function () {
      var should = window.scrollY > 140;
      if (should !== on) { on = should; frame.classList.toggle("is-retracted", on); }
    }, { passive: true });
  }

  /* ---------------------------------------------------------- the media layer */
  function setupReels() {
    var canvases = doc.querySelectorAll("canvas.reel-canvas");
    if (!canvases.length) return;
    if (prefersReduced() || narrow.matches) { drawStaticReels(canvases); return; }
    var running = [];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var c = entry.target;
        if (entry.isIntersecting) {
          if (running.length < 2) running.push(c);
          else running.splice(2);
        } else {
          var i = running.indexOf(c);
          if (i >= 0) running.splice(i, 1);
          c.dataset.released = "1";
        }
      });
    }, { rootMargin: "100% 0px 100% 0px" });
    canvases.forEach(function (c) { io.observe(c); });
    var start = performance.now();
    function frame(ts) {
      running.forEach(function (c) { drawReelFrame(c, (ts - start) / 1000); });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function fieldFor(seed) {
    var h = 0;
    for (var i = 0; i < seed.length; i++) { h = (h * 31 + seed.charCodeAt(i)) & 0xfffffff; }
    var stops = ["#313236", "#676767", "#333333", "#455e53", "#dedede"];
    var i1 = h % 5, i2 = (h >> 3) % 4; if (i2 >= i1) i2 += 1;
    var i3 = ((h >> 6) % 4) + 1; if (i3 === i1 || i3 === i2) i3 = (i3 % 5);
    return { a: stops[i1], b: stops[i2], c: stops[i3], angle: (h >> 9) % 314 / 100, drift: (h >> 4) % 2 ? 1 : -1 };
  }

  function drawReelFrame(canvas, t) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var w = canvas.width, h = canvas.height;
    var f = fieldFor(canvas.dataset.seed || "cirrus");
    var phase = (t % 12) / 12;
    var bright = 0.97 + 0.03 * Math.sin((t % 17) / 17 * Math.PI * 2);
    var ang = f.angle + phase * 0.12 * f.drift;
    var g = ctx.createLinearGradient(0, 0, Math.cos(ang) * w, Math.sin(ang) * h);
    g.addColorStop(0, f.a);
    g.addColorStop(1, f.b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    var ang2 = f.angle + 1.1 - phase * 0.18 * f.drift;
    var g2 = ctx.createLinearGradient(0, h, Math.cos(ang2) * w, h - Math.sin(ang2) * h);
    g2.addColorStop(0, f.c);
    g2.addColorStop(1, "rgba(6,4,3,0)");
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    if (bright < 1) { ctx.fillStyle = "rgba(6,4,3," + ((1 - bright) * 0.9).toFixed(3) + ")"; ctx.fillRect(0, 0, w, h); }
    if (!canvas._grain) {
      var tile = doc.createElement("canvas");
      tile.width = 120; tile.height = 120;
      var tctx = tile.getContext("2d");
      var img = tctx.createImageData(120, 120);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = 128 + (Math.random() - 0.5) * 70;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      tctx.putImageData(img, 0, 0);
      canvas._grain = tile;
    }
    var pat = ctx.createPattern(canvas._grain, "repeat");
    ctx.globalAlpha = 0.05;
    ctx.save();
    ctx.translate(-(t * 13 % 120), -(t * 7 % 120));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w + 120, h + 120);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawStaticReels(canvases) {
    canvases.forEach(function (c) { drawReelFrame(c, 0); });
  }

  /* ---------------------------------------------------------- analytics
     One page-view count per route, after the route is interactive.
     A loader that never arrives fails quietly and takes nothing with it. */
  function beacon() {
    try {
      var body = JSON.stringify({ path: location.pathname });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/analytics/view", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/analytics/view", { method: "POST", body: body, keepalive: true }).catch(function () {});
      }
    } catch (e) { /* never a visitor's problem */ }
  }
  window.addEventListener(
    "load",
    function () {
      var fired = false;
      function go() {
        if (fired) return;
        fired = true;
        beacon();
      }
      if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 3000 });
      else setTimeout(go, 1200);
    },
    { once: true }
  );

  /* ---------------------------------------------------------- letter splits on load */
  window.addEventListener("DOMContentLoaded", function () {
    doc.querySelectorAll("[data-letters]").forEach(splitLetters);
    var wm = doc.querySelector(".wordmark");
    if (wm) wm.textContent = wm.textContent.trim();
    setupReveals();
    setupBlur();
    setupFooter();
    setupRetraction();
    setupReels();
    wake();
  });

  /* ---------------------------------------------------------- Alpine components */
  window.page = function () {
    return {
      cursorLabel: "",
      contactOpen: false,
      counter: { visible: doc.body.hasAttribute("data-preview-wait"), text: "Loading preview..." },
      openContact() {
        this.lastFocus = doc.activeElement;
        this.contactOpen = true;
        var self = this;
        this.$nextTick(function () { if (self.$refs.closebtn) self.$refs.closebtn.focus(); });
      },
      closeContact() {
        this.contactOpen = false;
        if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
      },
      trap(e) {
        if (!this.contactOpen) return;
        var overlay = this.$root.querySelector(".contact-overlay");
        if (!overlay) return;
        var focusables = overlay.querySelectorAll("a[href], button:not([disabled])");
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      },
      init() {
        var self = this;
        if (doc.body.hasAttribute("data-preview-wait")) {
          window.addEventListener("load", function () {
            setTimeout(function () { self.counter.visible = false; }, 400);
          });
        }
      },
    };
  };

  /* Below the breakpoint the CONTACT label opens the overlay, not a mail client. */
  doc.addEventListener("click", function (e) {
    var link = e.target.closest ? e.target.closest("[data-contact-label]") : null;
    if (!link) return;
    if (narrow.matches) {
      e.preventDefault();
      doc.body.dispatchEvent(new CustomEvent("open-contact"));
    }
  });

  window.footerState = function () { return {}; };

  window.entryRoute = function (works) {
    return {
      works: works,
      counter: { text: "0%", value: 0, done: false },
      init() {
        this.layout();
        window.addEventListener("resize", this.layout.bind(this));
        this.runCounter();
      },
      layout() {
        var vw = window.innerWidth, vh = window.innerHeight;
        var stills = this.$el.querySelectorAll(".cluster-still");
        /* Authored positions: dense to the centre, thinning to the edges, corners clear. */
        stills.forEach(function (el) {
          var i = parseInt(el.dataset.pos, 10);
          var scale = parseInt(el.dataset.scale, 10);
          var ring = Math.floor(i / 5);
          var angle = (i * 137.508) % 360;
          var rad = (angle * Math.PI) / 180;
          var r = (ring === 0 ? 0.12 : ring === 1 ? 0.24 : 0.34) * Math.min(vw, vh) * 1.5;
          var cx = vw / 2 + Math.cos(rad) * r * (vw / Math.min(vw, vh));
          var cy = vh / 2 + Math.sin(rad) * r * (vh / Math.min(vw, vh));
          var w = scale, h = Math.round(scale * 0.66);
          var x = Math.max(12, Math.min(vw - w - 12, cx - w / 2));
          var y = Math.max(12, Math.min(vh - h - 12, cy - h / 2));
          el.style.width = w + "px";
          el.style.height = h + "px";
          el.style.left = x + "px";
          el.style.top = y + "px";
          el.style.zIndex = String(3 + (i % 3));
        });
      },
      runCounter() {
        var self = this;
        var fonts = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
        var imgs = Array.from(doc.querySelectorAll(".cluster-img"));
        var total = 2 + imgs.length;
        var done = 0;
        var deadline = Date.now() + 4000;
        function bump() {
          done += 1;
          self.counter.value = Math.min(99, Math.round((done / total) * 100));
          self.counter.text = self.counter.value + "%";
        }
        function finish() {
          self.counter.value = 100;
          self.counter.text = "100%";
          setTimeout(function () { self.counter.done = true; }, prefersReduced() ? 0 : 320);
        }
        if (prefersReduced()) { finish(); return; }
        imgs.forEach(function (img) {
          if (img.complete && img.naturalWidth) bump();
          else {
            img.addEventListener("load", bump, { once: true });
            img.addEventListener("error", bump, { once: true });
          }
        });
        Promise.all([fonts, new Promise(function (r) { setTimeout(r, 120); })]).then(function () {
          bump(); bump();
          var wait = setInterval(function () {
            if (done >= total || Date.now() > deadline) {
              clearInterval(wait);
              finish();
            }
          }, 60);
        });
      },
    };
  };

  window.roster = function (talents, disciplines) {
    return {
      all: talents,
      disciplines: disciplines,
      active: disciplines[0] || "",
      index: 0,
      fitted: 125,
      init() {
        this.fit();
        window.addEventListener("resize", this.fit.bind(this));
        this.$nextTick(function () { this.announce(); }.bind(this));
      },
      get filtered() {
        var self = this;
        return this.all.filter(function (t) { return t.discipline === self.active; });
      },
      choose(d) { this.active = d; this.index = 0; this.fit(); this.announce(); },
      advance(step) {
        var n = this.filtered.length;
        if (!n) return;
        this.index = (this.index + step + n) % n;
        this.announce();
      },
      fit() {
        var longest = this.filtered.reduce(function (acc, t) {
          return t.title.length > acc.length ? t.title : acc;
        }, "");
        var vw = window.innerWidth, vh = window.innerHeight;
        if (narrow.matches) { this.fitted = 40; return; }
        var byWidth = Math.floor((vw * 0.86) / Math.max(4, longest.length * 0.55));
        var byHeight = Math.floor(vh * 0.26);
        this.fitted = Math.max(28, Math.min(125, Math.min(byWidth, byHeight)));
      },
      announce() {
        var t = this.filtered[this.index];
        var stage = this.$refs.stage;
        if (t && stage) stage.setAttribute("aria-label", t.title + ", " + t.discipline);
      },
    };
  };

  /* studio helpers */
  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    return fetch(path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.error || "That request was refused.");
        return body;
      });
    });
  }

  window.loginForm = function () {
    return {
      email: "", password: "", error: "", busy: false,
      submit() {
        var self = this;
        this.busy = true; this.error = "";
        api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: this.email, password: this.password }) })
          .then(function () {
            /* the server refuses a viewer at /studio and shows the entry route */
            window.location.assign("/studio");
          })
          .catch(function (e) { self.error = e.message; self.busy = false; });
      },
    };
  };

  window.signupForm = function () {
    return {
      email: "", password: "", error: "", busy: false,
      submit() {
        var self = this;
        this.busy = true; this.error = "";
        api("/api/auth/signup", { method: "POST", body: JSON.stringify({ email: this.email, password: this.password }) })
          .then(function () { window.location.assign("/"); })
          .catch(function (e) { self.error = e.message; self.busy = false; });
      },
    };
  };

  window.palette = function (items) {
    return {
      items: items,
      query: "",
      active: 0,
      actions: [
        { key: "new-talent", action: true, kindLabel: "ACTION", title: "New talent", slug: "/studio/talents/new", state: "OPEN" },
        { key: "new-work", action: true, kindLabel: "ACTION", title: "New work", slug: "/studio/works/new", state: "OPEN" },
        { key: "reorder", action: true, kindLabel: "ACTION", title: "Reorder index", slug: "#reorder", state: "OPEN" },
      ],
      init() { this.$refs.input.focus(); },
      get results() {
        var q = this.query.trim().toLowerCase();
        var base = this.ordered(this.items).map(function (i) {
          return {
            key: i.id, id: i.id, kind: i.kind, kindLabel: i.kind.toUpperCase(),
            title: i.title, slug: i.slug, state: i.published ? "LIVE" : "UNLISTED", item: i,
          };
        });
        var all = this.actions.concat(base);
        if (!q) return all.slice(0, 12);
        return all.filter(function (r) {
          return r.title.toLowerCase().indexOf(q) >= 0 || (r.slug || "").toLowerCase().indexOf(q) >= 0;
        }).slice(0, 12);
      },
      ordered(items) {
        return items.slice().sort(function (a, b) {
          if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
          return a.position - b.position;
        });
      },
      move(step) {
        this.active = (this.active + step + this.results.length) % this.results.length;
      },
      run(r) {
        if (!r) return;
        if (r.key === "reorder") { this.reorder(); return; }
        window.location.assign(r.slug);
      },
      reorder() {
        var self = this;
        var works = this.ordered(this.items).filter(function (i) { return i.kind === "work"; });
        var ids = works.map(function (w) { return w.id; });
        /* the palette reorders by moving the last work to the front, once, then confirms */
        if (ids.length > 1) ids = [ids[ids.length - 1]].concat(ids.slice(0, -1));
        api("/api/studio/works/order", { method: "POST", body: JSON.stringify({ ordered_ids: ids }) })
          .then(function () { window.location.reload(); })
          .catch(function (e) { alert(e.message); });
      },
      recordMeta(item) {
        return (item.kind === "talent" ? (item.discipline || "").toUpperCase() : (item.ordinal_label || "—")) +
          " · " + item.media_count + " MEDIA · " + item.credits_count + " CREDITS";
      },
      signout() {
        api("/api/auth/logout", { method: "POST" }).then(function () { window.location.assign("/"); });
      },
    };
  };

  window.newTalentForm = function () {
    return {
      title: "", slug: "", discipline: "director", error: "", busy: false,
      submit() {
        var self = this;
        this.busy = true; this.error = "";
        api("/api/studio/items", {
          method: "POST",
          body: JSON.stringify({ kind: "talent", title: this.title, slug: this.slug || this.title, discipline: this.discipline }),
        })
          .then(function (res) { window.location.assign("/studio/items/" + res.id); })
          .catch(function (e) { self.error = e.message; self.busy = false; });
      },
    };
  };

  window.newWorkForm = function () {
    return {
      title: "", slug: "", variant: "left", error: "", busy: false,
      submit() {
        var self = this;
        this.busy = true; this.error = "";
        api("/api/studio/items", {
          method: "POST",
          body: JSON.stringify({ kind: "work", title: this.title, slug: this.slug || this.title, variant: this.variant }),
        })
          .then(function (res) { window.location.assign("/studio/items/" + res.id); })
          .catch(function (e) { self.error = e.message; self.busy = false; });
      },
    };
  };

  window.itemEditor = function (record) {
    return {
      record: record,
      form: { title: record.title, slug: record.slug, discipline: record.discipline || "director", variant: record.variant || "left" },
      media: { role: "poster", width: 598, height: 320, alt: "", seed: "" },
      credit: { role: "", name: "", talent_id: "" },
      error: "", ok: "", busy: false,
      talents() { return this.houseTalents; },
      get houseTalents() {
        var el = doc.querySelector("[data-talents]");
        if (el) { try { return JSON.parse(el.dataset.talents); } catch (e) { return []; } }
        return [];
      },
      save() {
        var self = this;
        this.busy = true; this.error = ""; this.ok = "";
        var payload = { title: this.form.title };
        if (this.record.kind === "talent") payload.discipline = this.form.discipline;
        else payload.variant = this.form.variant;
        if (this.form.slug !== this.record.slug) {
          api("/api/studio/items/" + this.record.id + "/slug", { method: "POST", body: JSON.stringify({ slug: this.form.slug }) })
            .then(function (res) {
              self.record.slug = res.slug;
              return api("/api/studio/items/" + self.record.id, { method: "PATCH", body: JSON.stringify(payload) });
            })
            .then(function (res) { self.record = Object.assign({}, self.record, res); self.ok = "Saved."; self.busy = false; })
            .catch(function (e) { self.error = e.message; self.busy = false; });
        } else {
          api("/api/studio/items/" + this.record.id, { method: "PATCH", body: JSON.stringify(payload) })
            .then(function (res) { self.record = Object.assign({}, self.record, res); self.ok = "Saved."; self.busy = false; })
            .catch(function (e) { self.error = e.message; self.busy = false; });
        }
      },
      togglePublish() {
        var self = this;
        var next = !this.record.published;
        this.busy = true; this.error = ""; this.ok = "";
        api("/api/studio/items/" + this.record.id + "/publish", { method: "POST", body: JSON.stringify({ published: next }) })
          .then(function (res) {
            if (next) window.location.assign("/studio/items/" + self.record.id + "/published");
            else { self.record = Object.assign({}, self.record, res); self.ok = "Unlisted."; self.busy = false; }
          })
          .catch(function (e) { self.error = e.message; self.busy = false; });
      },
      mintPreview() {
        var self = this;
        this.busy = true; this.error = ""; this.ok = "";
        api("/api/studio/preview-tokens", { method: "POST", body: JSON.stringify({ item_id: this.record.id }) })
          .then(function (res) {
            window.open("/preview/" + res.token, "_blank");
            self.ok = "Preview is open in a new tab, good for 15 minutes.";
            self.busy = false;
          })
          .catch(function (e) { self.error = e.message; self.busy = false; });
      },
      addMedia() {
        var self = this;
        this.busy = true; this.error = ""; this.ok = "";
        var body = { role: this.media.role, width: this.media.width, height: this.media.height, alt: this.media.alt };
        if (this.media.seed) body.seed = this.media.seed;
        api("/api/studio/items/" + this.record.id + "/media", { method: "POST", body: JSON.stringify(body) })
          .then(function () { return api("/api/studio/items/" + self.record.id); })
          .then(function (res) {
            self.record = Object.assign({}, self.record, { media: res.media, credits: res.credits });
            self.media.alt = ""; self.ok = "Media added."; self.busy = false;
          })
          .catch(function (e) { self.error = e.message; self.busy = false; });
      },
      removeMedia(m) {
        var self = this;
        api("/api/studio/media/" + m.id, { method: "DELETE" })
          .then(function () { return api("/api/studio/items/" + self.record.id); })
          .then(function (res) { self.record = Object.assign({}, self.record, { media: res.media, credits: res.credits }); })
          .catch(function (e) { self.error = e.message; });
      },
      addCredit() {
        var self = this;
        this.busy = true; this.error = ""; this.ok = "";
        var body = { role: this.credit.role, name: this.credit.name };
        if (this.credit.talent_id) body.talent_id = this.credit.talent_id;
        api("/api/studio/items/" + this.record.id + "/credits", { method: "POST", body: JSON.stringify(body) })
          .then(function () { return api("/api/studio/items/" + self.record.id); })
          .then(function (res) {
            self.record = Object.assign({}, self.record, { media: res.media, credits: res.credits });
            self.credit = { role: "", name: "", talent_id: "" }; self.ok = "Credit added."; self.busy = false;
          })
          .catch(function (e) { self.error = e.message; self.busy = false; });
      },
      removeCredit(c) {
        var self = this;
        api("/api/studio/credits/" + c.id, { method: "DELETE" })
          .then(function () { return api("/api/studio/items/" + self.record.id); })
          .then(function (res) { self.record = Object.assign({}, self.record, { media: res.media, credits: res.credits }); })
          .catch(function (e) { self.error = e.message; });
      },
      creditTalent(c) { return c.talent ? "→ " + c.talent.title : (c.talent_id ? "→ talent" : ""); },
      signout() { api("/api/auth/logout", { method: "POST" }).then(function () { window.location.assign("/"); }); },
    };
  };
})();
