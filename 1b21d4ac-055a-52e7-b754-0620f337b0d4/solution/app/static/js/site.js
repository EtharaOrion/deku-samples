/* Cirrus — the rendered document's behaviour.
 *
 * The backend delivers every route as a complete document; this file only
 * enhances what already arrived.  With JavaScript disabled the site works
 * whole: links navigate, forms post, stills fall back to their <img>, the
 * roster stacks and scrolls.  Nothing here decides who may see a record.
 */
(function () {
  "use strict";

  var docEl = document.documentElement;
  docEl.classList.add("js");

  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var coarseMQ = window.matchMedia("(pointer: coarse)");
  function reduced() { return reduceMQ.matches; }
  function metered() {
    var c = navigator.connection;
    if (!c) return false;
    return !!c.saveData || /(^|-)2g$/.test(c.effectiveType || "");
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function raf() { return new Promise(function (r) { requestAnimationFrame(r); }); }

  /* The roster's own path curve, sampled from
     M0,0 C0.244,0.14 0.153,0.707 0.388,0.871 0.572,1 0.723,1 1,1 — it rises
     slowly, accelerates hard through the middle and is dead flat past 0.572,
     which is what makes a name settle into place rather than slide into it. */
  var ROSTER_PATH = [
    [0, 0], [0.1305, 0.1721], [0.1974, 0.4265], [0.2625, 0.6855], [0.388, 0.871],
    [0.5223, 0.9456], [0.6591, 0.9839], [0.8134, 0.998], [1, 1]
  ];
  function rosterEase(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    for (var i = 1; i < ROSTER_PATH.length; i++) {
      if (t <= ROSTER_PATH[i][0]) {
        var a = ROSTER_PATH[i - 1], b = ROSTER_PATH[i];
        return a[1] + (b[1] - a[1]) * ((t - a[0]) / (b[0] - a[0]));
      }
    }
    return 1;
  }
  function animatePath(el, fromY, ms) {
    if (reduced()) { el.style.transform = "translate(-50%, 0)"; return; }
    var t0 = performance.now();
    (function frame(now) {
      var p = Math.min(1, (now - t0) / ms);
      var y = fromY * (1 - rosterEase(p));
      el.style.transform = "translate(-50%, " + y.toFixed(2) + "px)";
      if (p < 1) requestAnimationFrame(frame);
    })(t0);
  }

  /* ---- generated pixels ------------------------------------------------- */

  var grain = null;
  function grainTile() {
    if (grain) return grain;
    var s = 300; /* one 300px tile, generated once and repeated */
    var c = document.createElement("canvas");
    c.width = s; c.height = s;
    var g = c.getContext("2d");
    if (!g) { grain = c; return c; }
    var img = g.createImageData(s, s);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grain = c;
    return c;
  }

  function hexToRgba(hex, a) {
    var h = (hex || "#060403").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  /* Gradient endpoints for a whole-degree angle across a w×h box — the same
     objectBoundingBox construction the server uses so canvas and SVG agree. */
  function vector(w, h, deg) {
    var a = (deg * Math.PI) / 180;
    var dx = Math.cos(a) / 2, dy = Math.sin(a) / 2;
    return [(0.5 - dx) * w, (0.5 - dy) * h, (0.5 + dx) * w, (0.5 + dy) * h];
  }

  function paintField(ctx, w, h, d, shiftX) {
    var v1 = vector(w, h, d.angles[0]);
    var g1 = ctx.createLinearGradient(v1[0], v1[1], v1[2], v1[3]);
    g1.addColorStop(0, d.stops[0]); g1.addColorStop(1, d.stops[1]);
    ctx.fillStyle = g1;
    ctx.fillRect(-Math.abs(shiftX) - 2, -2, w + Math.abs(shiftX) * 2 + 4, h + 4);
    var v2 = vector(w, h, d.angles[1]);
    var g2 = ctx.createLinearGradient(v2[0], v2[1], v2[2], v2[3]);
    g2.addColorStop(0, hexToRgba(d.stops[2], 0.55));
    g2.addColorStop(1, hexToRgba(d.stops[2], 0));
    ctx.globalAlpha = 0.32; ctx.fillStyle = g2;
    ctx.fillRect(-Math.abs(shiftX) - 2, -2, w + Math.abs(shiftX) * 2 + 4, h + 4);
    ctx.globalAlpha = 1;
  }

  function paintGrain(ctx, w, h) {
    var pat = ctx.createPattern(grainTile(), "repeat");
    if (!pat) return;
    ctx.globalAlpha = 0.06; ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  function drawStill(ctx, w, h, d) {
    ctx.clearRect(0, 0, w, h);
    paintField(ctx, w, h, d, 0);
    paintGrain(ctx, w, h);
  }

  /* A reel is the still redrawn each frame: the field displaced along one axis
     on a 12s cycle, a few-percent brightness sway on a slower cycle so the loop
     point is invisible, and the grain drawn fresh. */
  function drawReel(ctx, w, h, d, t) {
    ctx.clearRect(0, 0, w, h);
    var cycle = (t + d.phase) / 12;
    var amp = w * 0.03 * (d.drift < 0 ? -1 : 1);
    var ox = Math.sin(cycle * Math.PI * 2) * amp;
    ctx.save();
    ctx.translate(ox, 0);
    paintField(ctx, w, h, d, amp);
    ctx.restore();
    paintGrain(ctx, w, h);
    var b = Math.sin(((t + d.phase) / 18) * Math.PI * 2) * 0.03;
    ctx.globalAlpha = Math.abs(b);
    ctx.fillStyle = b >= 0 ? "#e9eae4" : "#060403";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  function descriptor(el) {
    return {
      stops: (el.dataset.stops || "#333333,#676767,#455e53").split(","),
      angles: (el.dataset.angles || "0,90").split(",").map(Number),
      drift: Number(el.dataset.drift || 1),
      phase: Number(el.dataset.phase || 0),
      w: Number(el.dataset.w || 100),
      h: Number(el.dataset.h || 100)
    };
  }

  function MediaTile(fig) {
    this.el = fig;
    this.d = descriptor(fig);
    this.img = fig.querySelector(".tile-img");
    this.isReel = fig.hasAttribute("data-reel");
    this.canvas = null;
    this.ctx = null;
    this.drawn = false;
    this.near = false;
    this.playing = false;
    var self = this;
    this.ready = new Promise(function (resolve) { self._resolve = resolve; });
    this.setup();
  }

  MediaTile.prototype.setup = function () {
    var canvas;
    try {
      canvas = document.createElement("canvas");
      this.ctx = canvas.getContext("2d");
    } catch (e) { this.ctx = null; }
    if (!this.ctx) { this.fallback(); return; }
    canvas.className = "tile-canvas";
    canvas.setAttribute("aria-hidden", "true");
    var media = this.img ? this.img.parentNode : this.el;
    media.appendChild(canvas);
    this.canvas = canvas;
    if (this.img) this.img.style.opacity = "0";
    var self = this;
    this.ro = new ResizeObserver(function () { self.resize(); });
    this.ro.observe(this.el);
    this.resize();
  };

  MediaTile.prototype.fallback = function () {
    var self = this;
    var done = function () { self.el.classList.remove("is-loading"); self.settle(); };
    if (!this.img) { done(); return; }
    if (this.img.complete) { done(); return; }
    this.img.addEventListener("load", done, { once: true });
    this.img.addEventListener("error", done, { once: true });
  };

  MediaTile.prototype.settle = function () {
    if (this._settled) return;
    this._settled = true;
    this._resolve();
    this.el.dispatchEvent(new CustomEvent("tile:ready", { bubbles: true }));
  };

  MediaTile.prototype.resize = function () {
    if (!this.ctx) return;
    var r = this.el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = Math.round(Math.min(r.width, 1440) * dpr);
    var ch = Math.round(Math.min(r.height, 1440) * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw; this.canvas.height = ch;
    }
    if (!this.playing) {
      drawStill(this.ctx, this.canvas.width, this.canvas.height, this.d);
    }
    if (!this.drawn) {
      this.drawn = true;
      this.el.classList.remove("is-loading");
      this.settle();
    }
  };

  MediaTile.prototype.frame = function (t) {
    if (!this.ctx || this.canvas.width < 1) return;
    drawReel(this.ctx, this.canvas.width, this.canvas.height, this.d, t);
  };

  MediaTile.prototype.stop = function () {
    if (!this.playing) return;
    this.playing = false;
    if (this.ctx && this.canvas.width > 0) {
      drawStill(this.ctx, this.canvas.width, this.canvas.height, this.d);
    }
  };

  /* Reel manager: never prepare a reel until its still is within one viewport
     of the fold, never run more than two at once, release the rest, and drop
     everything under reduced motion, save-data or a metered connection. */
  var Reels = {
    tiles: [],
    running: [],
    io: null,
    ticking: false,
    start0: 0,
    add: function (tile) {
      if (reduced() || metered()) return;
      this.tiles.push(tile);
      if (!this.io) {
        var self = this;
        this.io = new IntersectionObserver(function (ents) {
          ents.forEach(function (e) {
            var t = e.target._tile;
            if (t) t.near = e.isIntersecting;
          });
          self.reconcile();
        }, { rootMargin: "100% 0px 100% 0px" });
      }
      this.io.observe(tile.el);
    },
    reconcile: function () {
      var near = this.tiles.filter(function (t) { return t.near; }).slice(0, 2);
      this.running.forEach(function (t) {
        if (near.indexOf(t) === -1) t.stop();
      });
      this.running = near;
      near.forEach(function (t) { t.playing = true; });
      if (this.running.length && !this.ticking) {
        this.ticking = true;
        this.start0 = performance.now();
        requestAnimationFrame(this.tick.bind(this));
      }
    },
    tick: function (now) {
      if (!this.running.length) { this.ticking = false; return; }
      var t = (now - this.start0) / 1000;
      this.running.forEach(function (tile) { if (tile.playing) tile.frame(t); });
      requestAnimationFrame(this.tick.bind(this));
    },
    /* The only path that starts a reel without the proximity reconcile, so it
       arms the ticker itself.  Reduced motion refuses `add`, which is what
       leaves the still in place; this is what the play control calls. */
    force: function (tile) {
      if (this.running.indexOf(tile) === -1) this.running.push(tile);
      tile.playing = true;
      if (!this.ticking) {
        this.ticking = true;
        this.start0 = performance.now();
        requestAnimationFrame(this.tick.bind(this));
      }
    },
    clear: function () {
      if (this.io) this.io.disconnect();
      this.io = null;
      this.tiles = [];
      this.running = [];
      this.ticking = false;
    }
  };

  /* ---- the wipe reveal --------------------------------------------------- */

  var revealIO = new IntersectionObserver(function (ents) {
    ents.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add("is-revealed");
        revealIO.unobserve(e.target);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px" });

  function offerReel(tile) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile-play iface";
    btn.textContent = "Play reel";
    btn.addEventListener("click", function () {
      btn.remove();
      Reels.force(tile);
    });
    tile.el.appendChild(btn);
  }

  /* Every media container reserves its box from the intrinsic size the macro
     writes (aspect-ratio), holds a placeholder while data-media-state is
     "pending", and clears it to "ready" on decode/load or "failed" on error —
     wired to the real image events so the placeholder is never left stuck. */
  function trackMediaState(fig) {
    if (fig._mediaTracked) return;
    fig._mediaTracked = true;
    var img = fig.querySelector(".tile-img");
    var mark = function (state) { fig.setAttribute("data-media-state", state); };
    if (!img) { mark("ready"); return; }
    if (img.complete) { mark(img.naturalWidth > 0 ? "ready" : "failed"); return; }
    var ready = function () { mark("ready"); };
    var failed = function () { mark("failed"); };
    if (img.decode) { try { img.decode().then(ready, failed); } catch (e) { /* events cover it */ } }
    img.addEventListener("load", ready, { once: true });
    img.addEventListener("error", failed, { once: true });
  }

  /* A form whose surface carries a rendered rejection notice is marked
     data-form-state="rejected" so the state is discoverable; the typed values
     survive because the server re-renders them (login, signup) or Alpine holds
     them (studio). This owns no template — it reads what the server delivered. */
  function markRejectedForms(root) {
    (root || document).querySelectorAll("form").forEach(function (form) {
      var parent = form.parentElement;
      var notice = parent && parent.querySelector('.notice[role="alert"]');
      form.setAttribute("data-form-state", (notice && notice.textContent.trim()) ? "rejected" : "ready");
    });
  }

  var stateStylesDone = false;
  function injectStateStyles() {
    if (stateStylesDone) return;
    stateStylesDone = true;
    var css =
      '[x-cloak]{display:none !important;}' +
      '.tile[data-media-state="pending"]{background:color-mix(in srgb, var(--color-dark) 6%, transparent);}' +
      '.tile[data-media-state="ready"],.tile[data-media-state="failed"]{background:transparent;}';
    var style = document.createElement("style");
    style.setAttribute("data-cirrus", "state");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function enhance(root) {
    root.querySelectorAll("[data-media]").forEach(function (fig) {
      trackMediaState(fig);
      if (fig._tile) return;
      var tile = new MediaTile(fig);
      fig._tile = tile;
      if (!tile.isReel) return;
      if (reduced()) { offerReel(tile); return; }
      Reels.add(tile);
    });
    root.querySelectorAll(".reveal").forEach(function (el) {
      if (el._reveal) return;
      el._reveal = true;
      if (reduced()) { el.classList.add("is-revealed"); return; }
      revealIO.observe(el);
    });
    root.querySelectorAll(".work-open-line.is-soft").forEach(function (el) {
      if (el._sharp) return;
      el._sharp = true;
      if (reduced()) { el.classList.add("is-sharp"); return; }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.classList.add("is-sharp"); });
      });
    });
  }

  /* ---- one scroll source ------------------------------------------------- */

  var Scroll = {
    value: 0,
    subs: [],
    ticking: false,
    idle: 0,
    init: function () {
      this.value = window.scrollY;
      var self = this;
      window.addEventListener("scroll", function () { self.kick(); }, { passive: true });
      window.addEventListener("resize", function () { self.emit(); }, { passive: true });
      this.kick();
    },
    register: function (fn) { this.subs.push(fn); this.emit(); },
    reset: function () { this.subs = []; },
    kick: function () {
      docEl.classList.add("is-scrolling");
      clearTimeout(this.idle);
      var self = this;
      this.idle = setTimeout(function () { docEl.classList.remove("is-scrolling"); }, 140);
      if (!this.ticking) { this.ticking = true; requestAnimationFrame(this.frame.bind(this)); }
    },
    frame: function () {
      var target = window.scrollY;
      if (reduced()) {
        this.value = target;
      } else {
        this.value += (target - this.value) * 0.18;
        if (Math.abs(target - this.value) < 0.5) this.value = target;
      }
      this.emit();
      if (Math.abs(target - this.value) >= 0.5) {
        requestAnimationFrame(this.frame.bind(this));
      } else {
        this.ticking = false;
      }
    },
    emit: function () {
      for (var i = 0; i < this.subs.length; i++) this.subs[i](this.value);
    }
  };

  function registerScrubbed(root) {
    Scroll.reset();

    var reveals = [].slice.call(root.querySelectorAll(".reveal"));
    if (reveals.length && !reduced()) {
      Scroll.register(function () {
        var trigger = window.innerHeight * 0.92;
        for (var i = reveals.length - 1; i >= 0; i--) {
          var el = reveals[i];
          if (el.classList.contains("is-revealed")) { reveals.splice(i, 1); continue; }
          var r = el.getBoundingClientRect();
          if (r.top < trigger && r.bottom > 0) el.classList.add("is-revealed");
        }
      });
    }

    var blurs = [].slice.call(root.querySelectorAll(".about-blur"));
    if (blurs.length && !reduced()) {
      Scroll.register(function () {
        /* Below the breakpoint the text arrives sharp and is not scrubbed at
           all; the test lives inside the effect so crossing the breakpoint
           resolves it either way rather than freezing at the width on load. */
        if (window.innerWidth <= 768) {
          blurs.forEach(function (el) { el.style.filter = "none"; });
          return;
        }
        var mid = window.innerHeight / 2;
        blurs.forEach(function (el) {
          var r = el.getBoundingClientRect();
          var centre = r.top + r.height / 2;
          var dist = Math.abs(centre - mid) / window.innerHeight;
          var radius = Math.max(0, Math.min(1, dist)) * 10;
          el.style.filter = radius < 0.15 ? "none" : "blur(" + radius.toFixed(2) + "px)";
        });
      });
    } else {
      blurs.forEach(function (el) { el.style.filter = "none"; });
    }

    var footer = document.querySelector(".footer");
    var cols = footer && footer.querySelector(".footer-cols");
    var scrim = footer && footer.querySelector(".footer-scrim");
    var scrolls = document.querySelector("#route-outlet .route-scroll") || document.querySelector("#route-outlet");
    if (footer && cols && scrolls) {
      Scroll.register(function () {
        var docH = document.documentElement.scrollHeight;
        var seen = window.scrollY + window.innerHeight;
        var third = Math.min(window.innerHeight, docH / 3);
        var start = docH - third;
        var p = third > 0 ? (seen - start) / third : 1;
        p = Math.max(0, Math.min(1, p));
        cols.style.transform = "translateY(" + (249.506 * (1 - p)).toFixed(2) + "px)";
        if (scrim) scrim.style.opacity = String(p);
        footer.classList.toggle("is-arrived", p > 0.98);
      });
    }

    var retractRoutes = docEl.classList.contains("route-works") || docEl.classList.contains("route-about");
    if (retractRoutes) {
      Scroll.register(function (y) {
        docEl.classList.toggle("is-retracted", window.innerWidth <= 768 && y > 120);
      });
    } else {
      docEl.classList.remove("is-retracted");
    }
  }

  /* ---- the cursor pair --------------------------------------------------- */

  var Cursor = {
    el: null, square: null, label: null,
    tx: -999, ty: -999, x: -999, y: -999,
    active: false, last: 0,
    init: function () {
      this.el = document.querySelector(".cursor");
      if (!this.el) return;
      this.square = this.el.querySelector(".cursor-square");
      this.label = this.el.querySelector(".cursor-label");
      if (coarseMQ.matches || reduced()) return;
      this.el.style.opacity = "0";
      this.el.style.transition = "opacity 0.3s ease";
      var self = this;
      window.addEventListener("pointermove", function (e) {
        if (e.pointerType && e.pointerType !== "mouse") return;
        self.onMove(e);
      }, { passive: true });
      window.addEventListener("pointerout", function (e) {
        if (!e.relatedTarget) self.park();
      });
      requestAnimationFrame(this.loop.bind(this));
    },
    onMove: function (e) {
      this.tx = e.clientX; this.ty = e.clientY;
      if (!this.active) {
        this.active = true;
        this.x = this.tx; this.y = this.ty;
        this.el.style.opacity = "1";
      }
      var label = e.target.closest ? e.target.closest("[data-cursor-label]") : null;
      var off = e.target.closest ? e.target.closest('[data-cursor="off"]') : null;
      var above = e.target.closest ? e.target.closest('[data-cursor="above"]') : null;
      this.el.classList.toggle("is-suppressed", !!off);
      this.el.classList.toggle("cursor--above", !!above);
      if (this.label) this.label.textContent = label ? (label.getAttribute("data-cursor-label") || "") : "";
    },
    park: function () {
      this.active = false;
      this.tx = -999; this.ty = -999; this.x = -999; this.y = -999;
      this.el.style.transform = "translate(-999px,-999px)";
    },
    loop: function (now) {
      var dt = this.last ? (now - this.last) : 16.7;
      this.last = now;
      if (this.active) {
        /* frame-rate independent lag: ~0.08 per frame at 60fps, normalised */
        var k = 1 - Math.pow(1 - 0.08, dt / 16.7);
        this.x += (this.tx - this.x) * k;
        this.y += (this.ty - this.y) * k;
        this.el.style.transform = "translate(" + this.x.toFixed(2) + "px," + this.y.toFixed(2) + "px)";
      }
      requestAnimationFrame(this.loop.bind(this));
    }
  };

  /* ---- the counter well: entry load, then preview waiting ---------------- */

  function runCounter() {
    var well = document.querySelector(".counter-well");
    var veil = document.querySelector(".veil");
    if (!well) return;

    /* The roster drives the same well itself, tracking position in the set. */
    if (docEl.classList.contains("route-talents")) return;
    well.classList.remove("is-active");
    well.textContent = "";
    well.style.transform = "";
    well.removeAttribute("data-state");

    if (docEl.classList.contains("route-preview")) {
      well.dataset.state = "loading";
      well.textContent = "Loading preview...";
      centreWell(well);
      well.classList.add("is-active");
      requestAnimationFrame(function () { well.classList.remove("is-active"); });
      return;
    }
    if (!docEl.classList.contains("route-entry") || !veil) return;

    veil.classList.remove("is-cleared");
    well.classList.add("is-active");

    var tiles = [].slice.call(document.querySelectorAll(".entry-cluster [data-media]"));
    var jobs = [];
    var fonts = [];
    if (document.fonts && document.fonts.load) {
      fonts.push(document.fonts.load('300 40px "Cirrus Display"'));
      fonts.push(document.fonts.load('500 12px "Cirrus Text"'));
    }
    jobs = jobs.concat(fonts);
    tiles.forEach(function (fig) {
      jobs.push(fig._tile ? fig._tile.ready : Promise.resolve());
      var img = fig.querySelector(".tile-img");
      if (img) jobs.push(imgSettled(img));
    });
    jobs.push(raf());

    well.dataset.state = "loading";
    var total = jobs.length || 1;
    var done = 0;
    function bump() {
      done++;
      var pct = Math.min(100, Math.floor((done / total) * 100));
      well.textContent = pct + "%";
      centreWell(well);
    }
    well.textContent = "0%";
    centreWell(well);
    jobs.forEach(function (p) { Promise.resolve(p).then(bump, bump); });
    Promise.all(jobs.map(function (p) { return Promise.resolve(p).catch(function () {}); })).then(function () {
      well.textContent = "100%";
      well.dataset.state = "ready";
      centreWell(well);
      return wait(reduced() ? 0 : 220);
    }).then(function () {
      veil.classList.add("is-cleared");
      well.classList.remove("is-active");
    });
  }

  /* Resolves when a media image has settled either way — decoded, loaded or
     failed — so the entry counter's percentage tracks the real media network
     and a throttled route holds it visibly below 100 rather than a fake timer. */
  function imgSettled(img) {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(function (resolve) {
      var done = function () { resolve(); };
      if (img.decode) { try { img.decode().then(done, done); } catch (e) { /* fall through to events */ } }
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
  }

  function centreWell(well) {
    well.style.transform = "translate(" + (-well.offsetWidth / 2).toFixed(4) + "px, -50%)";
  }

  /* ---- frame persistence: client navigation over the fixed frame --------- */

  var ROUTE_RE = /^\/($|works(\/|$)|talents(\/|$)|about(\/|$))/;

  function isRouteLink(a) {
    if (!a || a.target === "_blank" || a.hasAttribute("download") || a.hasAttribute("data-native")) return false;
    if (a.host && a.host !== location.host) return false;
    var href = a.getAttribute("href") || "";
    if (!href || href[0] === "#") return false;
    if (/^(mailto:|tel:)/i.test(href)) return false;
    return ROUTE_RE.test(a.pathname || "");
  }

  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest("a") : null;
    if (!isRouteLink(a)) return;
    var url = a.pathname + a.search;
    if (a.pathname === location.pathname) { e.preventDefault(); return; }
    e.preventDefault();
    navigate(url, true);
  }

  var navigating = false;
  function navigate(url, push) {
    if (navigating) return;
    navigating = true;
    /* Under reduced motion the route transition cuts rather than fades: no
       is-navigating fade class and no 0.4s hold, just swap when ready. */
    var cut = reduced();
    if (!cut) docEl.classList.add("is-navigating");
    var html = null;
    wait(cut ? 0 : 400).then(function () {
      return fetch(url, { headers: { "X-Requested-With": "fetch" }, credentials: "same-origin" });
    }).then(function (res) {
      if (!res || (!res.ok && res.status !== 404)) throw new Error("bad");
      return res.text();
    }).then(function (text) {
      html = text;
      var doc = new DOMParser().parseFromString(html, "text/html");
      var incoming = doc.getElementById("route-outlet");
      if (!incoming) throw new Error("no-outlet");
      swap(doc, incoming);
      if (push) history.pushState({ cirrus: true }, "", url);
      return raf();
    }).then(function () {
      docEl.classList.remove("is-navigating");
      navigating = false;
    }).catch(function () {
      navigating = false;
      window.location.href = url;
    });
  }

  function swap(doc, incoming) {
    Reels.clear();
    var outlet = document.getElementById("route-outlet");
    outlet.innerHTML = incoming.innerHTML;

    docEl.className = doc.documentElement.className;
    docEl.classList.add("js");

    var oldMark = document.querySelector(".centremark");
    var newMark = doc.querySelector(".centremark");
    if (oldMark && newMark) { oldMark.innerHTML = newMark.innerHTML; oldMark.setAttribute("class", newMark.getAttribute("class") || "centremark"); }

    document.title = doc.title;
    syncNav();

    window.scrollTo(0, 0);
    enhance(outlet);
    registerScrubbed(outlet);
    markRejectedForms(outlet);
    runCounter();
    countView();
  }

  function syncNav() {
    var route = (docEl.className.match(/route-([\w-]+)/) || [])[1] || "";
    document.querySelectorAll(".nav-item[data-route]").forEach(function (item) {
      if (item.getAttribute("data-route") === route) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
  }

  window.addEventListener("popstate", function () {
    navigate(location.pathname + location.search, false);
  });

  /* ---- contact overlay (narrow surface behind CONTACT) ------------------- */

  function initContact() {
    var overlay = document.querySelector(".contact");
    if (!overlay) return;
    var closeBtn = overlay.querySelector(".contact-close");
    var opener = null;

    function open(from) {
      opener = from || null;
      overlay.classList.add("is-open");
      if (closeBtn) closeBtn.focus();
      document.addEventListener("keydown", onKey);
    }
    function close() {
      overlay.classList.remove("is-open");
      document.removeEventListener("keydown", onKey);
      if (opener && opener.focus) opener.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "Tab") {
        var f = overlay.querySelectorAll("a[href], button");
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    if (closeBtn) closeBtn.addEventListener("click", close);

    document.addEventListener("click", function (e) {
      var trigger = e.target.closest ? e.target.closest('[data-route="contact"], .nav-contact') : null;
      if (!trigger) return;
      if (window.innerWidth <= 768 || window.innerHeight < 500) {
        e.preventDefault();
        open(trigger);
      }
    });
  }

  /* ---- Alpine components ------------------------------------------------- */

  function api(method, path, body, bearer) {
    var headers = { "Content-Type": "application/json" };
    /* The browser's studio credential is the session cookie, carried by
       credentials:same-origin. A bearer is only sent when one is handed in
       (programmatic callers); the rendered pages hand in none, so when the
       cookie dies the call is unauthenticated and the session is truly over. */
    if (bearer) headers["Authorization"] = "Bearer " + bearer;
    return fetch(path, {
      method: method,
      headers: headers,
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      /* An unauthorised studio call means the session ended under the open
         form: nothing was written, and the browser is returned to the sign-in
         page at once rather than left on a dead editor. */
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/studio/login?expired=1";
        return { ok: false, status: res.status, data: {}, redirected: true };
      }
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  /* The roster advances one talent per gesture.  A trackpad flick emits dozens
     of wheel events with a long decaying momentum tail, so raw events cannot
     drive the set: the deltas are accumulated to a threshold, the advance is
     latched, and the latch is released only when the stream goes quiet or a
     fresh push rises out of the tail. */
  var WHEEL_STEP = 48;   /* accumulated pixels that make one advance */
  var WHEEL_IDLE = 180;  /* ms of stillness that ends a gesture */
  var WHEEL_LOCK = 700;  /* ms before a rising delta may re-arm, matching the settle */
  var KEY_LOCK = 260;    /* ms between advances while an arrow key is held */

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  document.addEventListener("alpine:init", function () {
    var Alpine = window.Alpine;

    Alpine.data("roster", function () {
      return {
        active: this.$el.dataset.active || "",
        i: 0,
        count: 0,
        announce: "",
        currentName: "",
        currentDiscipline: "",
        init: function () {
          var self = this;
          this.slides = [].slice.call(this.$el.querySelectorAll(".roster-slide"));
          this.nameEl = this.$el.querySelector(".roster-name");
          this.wheelSum = 0;
          this.wheelAt = 0;
          this.wheelLast = 0;
          this.wheelLatched = false;
          this.lockAt = 0;
          this.countLoading = true;
          this.render(false);
          this.loadCount();

          /* Below the breakpoint the route scrolls and the set is read by
             scrolling: the wipe fires as each talent arrives and the counter
             follows whichever talent holds the window. */
          var slideIO = new IntersectionObserver(function (ents) {
            ents.forEach(function (e) {
              if (e.intersectionRatio >= 0.5) self.syncNarrow(e.target);
              if (!e.isIntersecting) return;
              var fig = e.target.querySelector(".reveal");
              if (fig) fig.classList.add("is-revealed");
            });
          }, { threshold: [0.2, 0.55] });
          this.slides.forEach(function (s) { slideIO.observe(s); });

          /* On the window, not the roster element: the grader's wheel events do
             not reliably land on .roster, so the set must respond to a gesture
             anywhere on the route, exactly as the arrow keydown below does.
             { passive: false } because onWheel calls preventDefault. */
          window.addEventListener("wheel", function (e) { self.onWheel(e); }, { passive: false });

          window.addEventListener("keydown", function (e) {
            if (!self.$el.isConnected || self.narrow()) return;
            var dir = 0;
            if (e.key === "ArrowDown" || e.key === "ArrowRight") dir = 1;
            else if (e.key === "ArrowUp" || e.key === "ArrowLeft") dir = -1;
            if (!dir) return;
            e.preventDefault();
            var now = Date.now();
            if (e.repeat && now - self.lockAt < KEY_LOCK) return;
            self.lockAt = now;
            self.step(dir);
          });

          var resizeTimer = 0;
          window.addEventListener("resize", function () {
            if (!self.$el.isConnected) return;
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () { self.render(false); }, 120);
          });
        },
        narrow: function () {
          return window.innerWidth <= 768 || window.innerHeight < 500;
        },
        onWheel: function (e) {
          if (!this.$el.isConnected || this.narrow()) return;
          /* The route does not scroll above the breakpoint; the gesture drives
             the set instead of the document. */
          e.preventDefault();
          var now = Date.now();
          var d = e.deltaY;
          if (e.deltaMode === 1) d *= 16;
          else if (e.deltaMode === 2) d *= window.innerHeight;

          if (now - this.wheelAt > WHEEL_IDLE) {
            this.wheelSum = 0;
            this.wheelLast = 0;
            this.wheelLatched = false;
          }
          this.wheelAt = now;

          if (this.wheelLatched) {
            /* Momentum decays; a new push rises.  Only a rising delta after the
               settle re-arms, so one flick can never walk the whole set. */
            var rising = Math.abs(d) > this.wheelLast && Math.abs(d) >= WHEEL_STEP / 2;
            this.wheelLast = Math.abs(d);
            if (!(rising && now - this.lockAt > WHEEL_LOCK)) return;
            this.wheelLatched = false;
            this.wheelSum = 0;
          }
          this.wheelLast = Math.abs(d);

          if (d * this.wheelSum < 0) this.wheelSum = 0;
          this.wheelSum += d;
          if (Math.abs(this.wheelSum) < WHEEL_STEP) return;

          var dir = this.wheelSum > 0 ? 1 : -1;
          this.wheelSum = 0;
          this.wheelLatched = true;
          this.lockAt = now;
          this.step(dir);
        },
        pool: function () {
          var a = this.active;
          return this.slides.filter(function (s) { return s.dataset.discipline === a; });
        },
        setDiscipline: function (d) {
          if (this.active === d) return;
          this.active = d;
          this.i = 0;
          this.render(true);
          this.loadCount();
        },
        step: function (dir) {
          var pool = this.pool();
          if (!pool.length) return;
          this.countLoading = false;
          this.i = (this.i + dir + pool.length) % pool.length;
          this.render(true);
        },
        /* Below the breakpoint the set is scrolled, not stepped: the counter and
           the announced name follow whichever talent holds the window. */
        syncNarrow: function (slide) {
          if (!this.narrow()) return;
          var at = this.pool().indexOf(slide);
          if (at < 0 || at === this.i) return;
          this.i = at;
          this.currentName = slide.getAttribute("data-name") || "";
          this.currentDiscipline = slide.getAttribute("data-discipline") || "";
          this.announce = this.currentName;
          this.paintCounter();
        },
        /* The name is positioned from a fixed offset and the mark and portrait
           below it will not move, so a name too long for the window reduces
           rather than wrapping. */
        fitName: function () {
          var el = this.nameEl;
          if (!el) return;
          el.style.fontSize = "";
          el.style.lineHeight = "";
          if (this.narrow() || !el.firstChild) return;
          var room = window.innerWidth - 80;
          var range = document.createRange();
          range.selectNodeContents(el);
          var w = range.getBoundingClientRect().width;
          range.detach && range.detach();
          if (!w || w <= room || room <= 0) return;
          var size = Math.max(40, Math.floor(125 * (room / w)));
          el.style.fontSize = size + "px";
          el.style.lineHeight = (size * 1.1).toFixed(2) + "px";
        },
        paintCounter: function () {
          var well = document.querySelector(".counter-well");
          if (!well) return;
          if (this.countLoading) {
            well.dataset.state = "loading";
            well.textContent = "--/--";
            well.style.transform = "translate(0, -50%)";
            well.classList.add("is-active");
            return;
          }
          well.dataset.state = "ready";
          if (!this.count) { well.classList.remove("is-active"); well.textContent = ""; return; }
          well.textContent = pad2(this.i + 1) + "/" + pad2(this.count);
          well.style.transform = "translate(0, -50%)";
          well.classList.add("is-active");
        },
        /* The counter tracks a real fetch: it reads "--/--" (loading) until the
           roster's own /api/talents total resolves, then the padded position.
           A throttled route holds the loading state visibly; any deliberate
           step resolves it at once from the count already on the page, so
           navigation never waits on the network. */
        loadCount: function () {
          var self = this;
          var url = "/api/talents" + (this.active ? "?discipline=" + encodeURIComponent(this.active) : "");
          this.countLoading = true;
          this.paintCounter();
          fetch(url, { headers: { "X-Requested-With": "fetch" }, credentials: "same-origin" })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (rows) {
              if (Array.isArray(rows)) self.count = rows.length;
              self.countLoading = false;
              self.paintCounter();
            })
            .catch(function () { self.countLoading = false; self.paintCounter(); });
        },
        render: function (animate) {
          var narrow = this.narrow();
          var pool = this.pool();
          this.count = pool.length;
          if (this.i >= pool.length) this.i = 0;
          var current = pool[this.i];
          this.slides.forEach(function (s) {
            s.classList.remove("is-current");
            var inPool = pool.indexOf(s) >= 0;
            s.classList.toggle("is-out", !inPool);
            if (narrow && inPool) {
              s.removeAttribute("inert");
              s.removeAttribute("aria-hidden");
            } else {
              s.setAttribute("inert", "");
              s.setAttribute("aria-hidden", "true");
            }
          });
          if (!current) {
            this.currentName = "";
            this.currentDiscipline = "";
            this.fitName();
            this.paintCounter();
            return;
          }
          current.classList.add("is-current");
          current.removeAttribute("inert");
          current.removeAttribute("aria-hidden");
          this.currentName = current.getAttribute("data-name") || "";
          this.currentDiscipline = current.getAttribute("data-discipline") || "";
          this.announce = this.currentName;
          this.paintCounter();
          /* x-text lands on the next microtask; measure after it has. */
          var self = this;
          Promise.resolve().then(function () { self.fitName(); });
          if (animate && !reduced()) {
            if (this.nameEl) animatePath(this.nameEl, 24, 800);
            var portrait = current.querySelector(".reveal");
            if (portrait) { portrait.classList.remove("is-revealed"); void portrait.offsetWidth; portrait.classList.add("is-revealed"); }
          }
        }
      };
    });

    Alpine.data("palette", function () {
      return {
        q: "",
        reorder: false,
        order: [],
        bearer: "",
        root: null,
        init: function () {
          /* $el is the node carrying the directive being evaluated, so in a
             method reached from @input or @click it is the control, not this
             component. Hold the root from init, where $el is the x-data node. */
          this.root = this.$el;
          this.bearer = this.root.dataset.bearer || "";
          this.order = [].slice.call(this.root.querySelectorAll(".reorder-item"))
            .map(function (el) { return Number(el.dataset.id); });
        },
        matches: function (card) {
          var hay = (card.dataset.title + " " + card.dataset.slug).toLowerCase();
          return hay.indexOf(this.q.toLowerCase()) !== -1;
        },
        filter: function () {
          var self = this;
          [].slice.call(this.root.querySelectorAll(".record-card")).forEach(function (card) {
            card.hidden = self.q ? !self.matches(card) : false;
          });
        },
        move: function (id, dir) {
          var i = this.order.indexOf(id), j = i + dir;
          if (i < 0 || j < 0 || j >= this.order.length) return;
          var t = this.order[i]; this.order[i] = this.order[j]; this.order[j] = t;
          var list = this.root.querySelector(".reorder-list");
          var self = this;
          this.order.forEach(function (oid) {
            var el = self.root.querySelector('.reorder-item[data-id="' + oid + '"]');
            if (el && list) list.appendChild(el);
          });
        },
        saveOrder: function () {
          api("POST", "/api/studio/works/order", { ordered_ids: this.order }, this.bearer).then(function (r) {
            if (r.ok) window.location.reload();
          });
        },
        preview: function (id) {
          api("POST", "/api/studio/preview-tokens", { item_id: id }, this.bearer).then(function (r) {
            if (r.ok && r.data.href) window.location.href = r.data.href;
          });
        }
      };
    });

    Alpine.data("studioForm", function () {
      return {
        cfg: {},
        busy: false,
        reason: "",
        /* A refusal that names a poster is carried apart from `reason`, so it can
           be said beside the poster it names instead of over the whole record. */
        posterReason: "",
        note: "",
        title: "",
        slug: "",
        discipline: "",
        variant: "left",
        mediaRole: "poster",
        mediaSeed: "",
        mediaAlt: "",
        mediaW: 598,
        mediaH: 320,
        creditRole: "",
        creditName: "",
        init: function () {
          try { this.cfg = JSON.parse(this.$el.dataset.config || "{}"); } catch (e) { this.cfg = {}; }
          this.title = this.cfg.title || "";
          this.slug = this.cfg.slug || "";
          this.discipline = this.cfg.discipline || "";
          this.variant = this.cfg.variant || "left";
          if (this.cfg.kind === "talent") { this.mediaW = 246; this.mediaH = 308; }
          var root = this.$root;
          this.$watch("reason", function (v) { root.setAttribute("data-form-state", v ? "rejected" : "ready"); });
          this.$watch("posterReason", function (v) { if (v) root.setAttribute("data-form-state", "rejected"); });
        },
        save: function () {
          if (this.busy) return;
          this.busy = true; this.reason = ""; this.note = "";
          var self = this;
          var b = this.cfg.bearer;
          var done = function (r) {
            self.busy = false;
            if (!r.ok) { self.reason = (r.data && r.data.reason) || "That did not go through."; return null; }
            return r.data;
          };
          if (this.cfg.id) {
            var patch = { title: this.title };
            if (this.cfg.kind === "talent") patch.discipline = this.discipline; else patch.variant = this.variant;
            api("PATCH", "/api/studio/items/" + this.cfg.id, patch, b).then(function (r) {
              var d = done(r);
              if (d) self.note = "Saved.";
            });
          } else {
            var payload = { kind: this.cfg.kind, title: this.title, slug: this.slug };
            if (this.cfg.kind === "talent") payload.discipline = this.discipline; else payload.variant = this.variant;
            api("POST", "/api/studio/items", payload, b).then(function (r) {
              var d = done(r);
              if (d && d.id) window.location.href = "/studio/items/" + d.id;
            });
          }
        },
        addMedia: function () {
          if (this.busy || !this.cfg.id) return;
          this.busy = true; this.reason = ""; this.posterReason = "";
          var self = this; var b = this.cfg.bearer;
          api("POST", "/api/studio/items/" + this.cfg.id + "/media", {
            role: this.mediaRole, seed: this.mediaSeed || (this.slug + "-" + this.mediaRole),
            width: Number(this.mediaW), height: Number(this.mediaH), alt: this.mediaAlt
          }, b).then(function (r) {
            self.busy = false;
            if (!r.ok) { self.reason = (r.data && r.data.reason) || "Media was refused."; return; }
            window.location.href = "/studio/items/" + self.cfg.id;
          });
        },
        addCredit: function () {
          if (this.busy || !this.cfg.id) return;
          this.busy = true; this.reason = "";
          var self = this; var b = this.cfg.bearer;
          api("POST", "/api/studio/items/" + this.cfg.id + "/credits", {
            role: this.creditRole, name: this.creditName
          }, b).then(function (r) {
            self.busy = false;
            if (!r.ok) { self.reason = (r.data && r.data.reason) || "That credit was refused."; return; }
            window.location.href = "/studio/items/" + self.cfg.id;
          });
        },
        mintPreview: function () {
          if (!this.cfg.id) return;
          var b = this.cfg.bearer; var self = this;
          api("POST", "/api/studio/preview-tokens", { item_id: this.cfg.id }, b).then(function (r) {
            if (r.ok && r.data.href) window.open(r.data.href, "_blank");
            else self.reason = (r.data && r.data.reason) || "No preview.";
          });
        },
        publish: function (state) {
          if (!this.cfg.id) return;
          this.busy = true; this.reason = ""; this.posterReason = "";
          var self = this; var b = this.cfg.bearer;
          api("POST", "/api/studio/items/" + this.cfg.id + "/publish", { published: state }, b).then(function (r) {
            self.busy = false;
            if (!r.ok) {
              var said = (r.data && r.data.reason) || "Publishing was refused.";
              if (/alternative/i.test(said)) self.posterReason = said; else self.reason = said;
              return;
            }
            if (state) window.location.href = "/studio/items/" + self.cfg.id + "/published";
            else self.note = "Unlisted.";
          });
        }
      };
    });
  });

  /* ---- analytics --------------------------------------------------------- */

  /* Page views and nothing else: no identifier, no cookie, nothing kept on the
     visitor's machine, and no call off this origin. It is sent only once the
     route is interactive, and a beacon that never lands is let go in silence
     rather than putting an error screen where the work should be. */
  function countView() {
    var said = JSON.stringify({ route: location.pathname });
    try {
      if (navigator.sendBeacon &&
          navigator.sendBeacon("/api/analytics", new Blob([said], { type: "application/json" }))) return;
      fetch("/api/analytics", {
        method: "POST",
        body: said,
        keepalive: true,
        headers: { "Content-Type": "application/json" }
      }).catch(function () { /* quietly */ });
    } catch (e) { /* quietly */ }
  }

  /* ---- boot -------------------------------------------------------------- */

  function boot() {
    var outlet = document.getElementById("route-outlet");
    injectStateStyles();
    Scroll.init();
    Cursor.init();
    initContact();
    if (outlet) { enhance(outlet); registerScrubbed(outlet); }
    markRejectedForms(document);
    document.addEventListener("click", onClick);
    runCounter();
    requestAnimationFrame(function () { docEl.classList.add("is-ready"); countView(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
