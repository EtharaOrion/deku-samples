/* Cirrus front end: the rendered document's behaviour and nothing else.
   Alpine components, one scroll source, the media layer, the cursor pair. */
(function () {
  "use strict";

  var doc = document;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var coarse = window.matchMedia("(pointer: coarse)");
  var narrow = window.matchMedia("(max-width: 768px), (max-height: 500px)");

  function studioGone(status) {
    // An expired session on a studio surface goes back to the sign-in route;
    // the record itself was never changed, so nothing is half saved.
    if (!/^\/studio(\/|$)/.test(location.pathname)) return false;
    return status === 401 || status === 403 || status === 404;
  }

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    }).then(function (r) {
      if (studioGone(r.status) && url.indexOf("/api/studio/") === 0) {
        location.href = "/studio/login";
        return new Promise(function () {});
      }
      return r.text().then(function (t) {
        var data = {};
        try { data = t ? JSON.parse(t) : {}; } catch (e) { data = {}; }
        if (!r.ok) throw new Error((data && data.error) || "That request was refused");
        return data;
      });
    });
  }

  function slugify(s) {
    return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  /* ------------------------------------------------------------------ *
   * Letter splitting: the accessible name stays the whole word.
   * ------------------------------------------------------------------ */
  function splitLabels() {
    var nodes = doc.querySelectorAll("[data-split]");
    nodes.forEach(function (el) {
      if (el.dataset.splitDone) return;
      el.dataset.splitDone = "1";
      var text = el.textContent;
      el.setAttribute("aria-label", text.trim());
      el.textContent = "";
      Array.prototype.forEach.call(text, function (ch, i) {
        if (ch === " ") {
          el.appendChild(doc.createTextNode(" "));
          return;
        }
        var s = doc.createElement("span");
        s.className = "split-char";
        s.style.setProperty("--i", String(i));
        s.setAttribute("aria-hidden", "true");
        s.textContent = ch;
        el.appendChild(s);
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * The cursor pair: parked offscreen, lagging the pointer.
   * ------------------------------------------------------------------ */
  var cursorState = { x: -999, y: -999, tx: -999, ty: -999, live: false, raf: 0, label: "" };

  function cursorFrame(dt) {
    var k = 1 - Math.pow(1 - 0.08, dt / 16.67); // frame-rate independent 0.08 @60fps
    cursorState.x += (cursorState.tx - cursorState.x) * k;
    cursorState.y += (cursorState.ty - cursorState.y) * k;
    var pair = doc.getElementById("cursorPair");
    if (pair) {
      pair.style.transform = "translate(" + cursorState.x + "px," + cursorState.y + "px)";
    }
  }

  function cursorLoop(ts) {
    var dt = cursorState.last ? ts - cursorState.last : 16.67;
    cursorState.last = ts;
    if (!cursorState.live) {
      // keep compositing; no need to move once parked
    }
    cursorFrame(dt);
    window.requestAnimationFrame(cursorLoop);
  }

  function initCursor() {
    var pair = doc.getElementById("cursorPair");
    if (!pair || coarse.matches || reduced.matches) return;
    window.requestAnimationFrame(cursorLoop);
    doc.addEventListener("pointermove", function (e) {
      cursorState.tx = e.clientX;
      cursorState.ty = e.clientY;
      if (!cursorState.live) {
        cursorState.live = true;
        pair.classList.add("is-live");
      }
    });
    doc.addEventListener("pointerover", function (e) {
      var t = e.target.closest ? e.target.closest("[data-cursor]") : null;
      var labelEl = pair.querySelector(".cursor-label");
      if (t) {
        labelEl.textContent = t.getAttribute("data-cursor");
      } else if (e.target.closest && e.target.closest("a,button")) {
        labelEl.textContent = "";
      }
      pair.classList.toggle("is-directional", !!(t && t.dataset.cursorDirection === "above"));
    });
    doc.addEventListener("pointerout", function (e) {
      if (!e.relatedTarget || !(e.relatedTarget.closest && e.relatedTarget.closest("[data-cursor]"))) {
        var labelEl = pair.querySelector(".cursor-label");
        if (labelEl) labelEl.textContent = "";
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * One scroll source feeds every scrubbed property on the site.
   * ------------------------------------------------------------------ */
  var effects = [];
  function register(fn) { effects.push(fn); }

  var smoothState = { target: 0, current: 0, active: false };

  function applyScroll(y) {
    doc.documentElement.classList.add("is-scrolling");
    effects.forEach(function (fn) { fn(y); });
    window.clearTimeout(applyScroll._t);
    applyScroll._t = window.setTimeout(function () {
      doc.documentElement.classList.remove("is-scrolling");
    }, 140);
  }

  function initSmoothScroll() {
    var el = doc.documentElement;
    if (reduced.matches) {
      // native scroll, one source still
      window.addEventListener("scroll", function () { applyScroll(window.scrollY); }, { passive: true });
      return;
    }
    var wheelTimer = 0;
    window.addEventListener("wheel", function (e) {
      if (e.ctrlKey) return;
      // keyboard, anchors and find-in-page never come through here
      if (e.target.closest && e.target.closest("[data-native-scroll]")) return;
      e.preventDefault();
      smoothState.target = Math.max(0, Math.min(el.scrollHeight - window.innerHeight, smoothState.target + e.deltaY));
      if (!smoothState.active) {
        smoothState.active = true;
        smoothState.current = window.scrollY;
        window.requestAnimationFrame(step);
      }
    }, { passive: false });
    window.addEventListener("scroll", function () {
      // sync when the browser scrolled by other means (anchor, keyboard, find)
      smoothState.target = window.scrollY;
      smoothState.current = window.scrollY;
      applyScroll(window.scrollY);
    }, { passive: true });

    function step() {
      smoothState.current += (smoothState.target - smoothState.current) * 0.14;
      if (Math.abs(smoothState.target - smoothState.current) < 0.5) {
        smoothState.current = smoothState.target;
        smoothState.active = false;
      }
      window.scrollTo(0, smoothState.current);
      applyScroll(smoothState.current);
      if (smoothState.active) window.requestAnimationFrame(step);
    }
  }

  /* ------------------------------------------------------------------ *
   * The reveal: a wipe from the bottom edge, with a lateral slide.
   * ------------------------------------------------------------------ */
  function initReveals() {
    var els = Array.prototype.slice.call(doc.querySelectorAll(".reveal"));
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------ *
   * The blur: scrubbed against scroll, reversible.
   * ------------------------------------------------------------------ */
  function initBlur() {
    var blocks = Array.prototype.slice.call(doc.querySelectorAll("[data-blur-target]"));
    if (!blocks.length) return;
    if (reduced.matches || narrow.matches) {
      blocks.forEach(function (b) { b.style.filter = "none"; });
      return;
    }
    var rAF = 0, pending = 0;
    function compute() {
      pending = 0;
      var mid = window.innerHeight / 2;
      blocks = blocks.filter(function (b) { return b && typeof b.getBoundingClientRect === "function"; });
      blocks.forEach(function (b) {
        var r = b.getBoundingClientRect();
        var centre = r.top + r.height / 2;
        var dist = Math.abs(centre - mid) / window.innerHeight; // 0 at centre, 1 at a screen away
        var blur = Math.max(0, Math.min(10, dist * 20)); // ~10px at a screen away
        b.style.filter = blur < 0.15 ? "none" : "blur(" + blur.toFixed(2) + "px)";
      });
    }
    register(function () {
      if (!pending) pending = window.requestAnimationFrame(compute);
    });
    compute();
  }

  /* ------------------------------------------------------------------ *
   * The footer arrival: the last third of the scroll.
   * ------------------------------------------------------------------ */
  function initFooter() {
    var footer = doc.querySelector("[data-footer]");
    if (!footer) return;
    var scrim = footer.querySelector(".footer-scrim");
    var cols = footer.querySelector(".footer-cols");
    function compute() {
      var r = footer.getBoundingClientRect();
      var vh = window.innerHeight;
      var travel = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.9)));
      var eased = travel * travel * (3 - 2 * travel);
      if (reduced.matches) { eased = 1; }
      if (cols) cols.style.transform = "translateY(" + (249.506 * (1 - eased)).toFixed(1) + "px)";
      if (scrim) scrim.style.opacity = String(eased);
    }
    register(compute);
    compute();
  }

  /* ------------------------------------------------------------------ *
   * The frame retraction below the breakpoint: a threshold, not a scrub.
   * ------------------------------------------------------------------ */
  function initRetract() {
    var frame = doc.getElementById("frame");
    if (!frame || !narrow.matches) return;
    var last = null;
    register(function (y) {
      var down = y > 80;
      if (down !== last) {
        last = down;
        frame.classList.toggle("is-retracted", down);
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * The media layer: reels drawn onto a canvas, two at most, stills first.
   * ------------------------------------------------------------------ */
  var reels = [];
  var playing = 0;

  function reelAt(el) {
    return reels.find(function (r) { return r.el === el; });
  }

  function initReels() {
    var canvases = Array.prototype.slice.call(doc.querySelectorAll("[data-reel-play]"));
    canvases.forEach(function (btn) {
      var wrap = btn.closest(".reel-wrap");
      var canvas = wrap ? wrap.querySelector(".reel-canvas") : null;
      var still = wrap ? wrap.querySelector(".reel-still") : null;
      if (!canvas || !still) return;
      var seed = canvas.dataset.seed || "";
      btn.addEventListener("click", function () { start(wrap, canvas, still, seed, btn); });
      // only prepare once the still is one window height from the viewport
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              prepare(wrap, canvas, still, seed, btn);
            } else {
              release(wrap, canvas);
            }
          });
        }, { rootMargin: "100% 0px 100% 0px" });
        io.observe(wrap);
      }
    });
  }

  function okToPlay() {
    return !reduced.matches && playing < 2 && !navigator.saveData !== false;
  }

  function prepare(wrap, canvas, still, seed, btn) {
    var r = reelAt(wrap);
    if (r) return;
    r = { el: wrap, canvas: canvas, still: still, seed: seed, btn: btn, raf: 0, on: false, t0: 0 };
    reels.push(r);
    if (isNear(wrap)) start(r.el);
  }

  function isNear(el) {
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight;
    return r.bottom > -vh && r.top < vh * 2;
  }

  function start(wrap, canvas, still, seed, btn) {
    var r = reelAt(wrap);
    if (!r) {
      prepare(wrap, canvas, still, seed, btn);
      r = reelAt(wrap);
    }
    if (!r || r.on) return;
    r.on = true;
    r.t0 = performance.now();
    playing++;
    wrap.classList.add("is-playing");
    draw(r);
  }

  function release(wrap) {
    var r = reelAt(wrap);
    if (!r) return;
    if (r.on) {
      r.on = false;
      playing = Math.max(0, playing - 1);
      window.cancelAnimationFrame(r.raf);
      wrap.classList.remove("is-playing");
    }
  }

  function stopAll() {
    reels.slice().forEach(function (r) { release(r.el); });
  }

  function draw(r) {
    if (!r.on) return;
    var ctx = r.canvas.getContext("2d");
    var W = r.canvas.width, H = r.canvas.height;
    var t = (performance.now() - r.t0) / 1000;
    var n = 0;
    for (var i = 0; i < r.seed.length; i++) n = (n * 31 + r.seed.charCodeAt(i)) >>> 0;
    var dir = n % 2 ? 1 : -1;
    var phase = (t % 12) / 12;
    var shift = Math.sin(phase * Math.PI * 2) * W * 0.06 * dir;
    var bright = 0.5 + 0.5 * Math.sin((t % 19) / 19 * Math.PI * 2);
    var base = 44 + (n % 40);
    var c1 = "hsl(220, 6%, " + (base + bright * 6) + "%)";
    var c2 = "hsl(160, 10%, " + (base + 14 - bright * 6) + "%)";
    var g = ctx.createLinearGradient(shift, 0, W + shift, H);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = "#060403"; // the route's own ground, never #111111
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.05;
    for (var k = 0; k < 160; k++) {
      var x = (n * (k + 1) % W + t * 40 * dir + W) % W;
      var y = ((n * (k + 3)) % H + k) % H;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
    r.raf = window.requestAnimationFrame(function () { draw(r); });
  }

  /* ------------------------------------------------------------------ *
   * Route transitions: the frame and the well fade together.
   * ------------------------------------------------------------------ */
  function initRouteFade() {
    doc.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a") : null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      var href = a.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || /^(mailto:|https?:)/.test(href)) return;
      var url;
      try { url = new URL(a.href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin) return;
      if (reduced.matches) return; // cut rather than fade
      e.preventDefault();
      doc.body.classList.add("is-leaving");
      setTimeout(function () { location.href = a.href; }, 400);
    });
  }

  /* ------------------------------------------------------------------ *
   * Analytics waits until the route is interactive, counts page views.
   * ------------------------------------------------------------------ */
  function initAnalytics() {
    function send() {
      try {
        var key = "cirrus_pv";
        var raw = sessionStorage.getItem(key);
        var seen = raw ? JSON.parse(raw) : {};
        var day = new Date().toISOString().slice(0, 10);
        seen[day] = (seen[day] || 0) + 1;
        sessionStorage.setItem(key, JSON.stringify(seen));
      } catch (e) { /* no storage: fail quietly */ }
    }
    if (doc.readyState === "complete") setTimeout(send, 800);
    else window.addEventListener("load", function () { setTimeout(send, 800); });
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  doc.addEventListener("DOMContentLoaded", function () {
    splitLabels();
    requestAnimationFrame(function () {
      doc.body.classList.add("is-arrived");
    });
    initCursor();
    initSmoothScroll();
    initReveals();
    initBlur();
    initFooter();
    initRetract();
    initReels();
    initRouteFade();
    initAnalytics();
    applyScroll(window.scrollY || 0);
  });

  /* ================================================================== *
   * Alpine components, registered on alpine:init
   * ================================================================== */

  function entry() {
    return {
      pct: "0%",
      done: false,
      total: 0,
      loaded: 0,
      init: function () {
        var self = this;
        var well = doc.querySelector(".entry");
        var imgs = Array.prototype.slice.call(well ? well.querySelectorAll("img.cluster-img") : []);
        var fonts = 2; // the two variable files, preloaded
        var chrome = 1;
        self.total = imgs.length + fonts + chrome;
        self.bump(0);
        if (doc.fonts && doc.fonts.ready) {
          doc.fonts.ready.then(function () { self.bump(fonts); });
        } else {
          self.bump(fonts);
        }
        self.bump(chrome);
        imgs.forEach(function (img) {
          if (img.complete && img.naturalWidth) self.bump(1);
          else {
            img.addEventListener("load", function () { self.bump(1); });
            img.addEventListener("error", function () { self.bump(1); });
          }
        });
      },
      bump: function (n) {
        this.loaded += n;
        var pct = Math.min(100, Math.round((this.loaded / Math.max(1, this.total)) * 100));
        this.pct = pct + "%";
        if (pct >= 100) this.finish();
      },
      finish: function () {
        if (this.done) return;
        this.done = true;
        var c = doc.querySelector(".entry-counter");
        if (c) c.classList.add("is-done");
      },
    };
  };

  function frame () {
    return { hidden: false };
  };

  function cursor () {
    return { label: "" };
  };

  function overlay () {
    var opener = null;
    return {
      open: false,
      show: function (el) {
        opener = el || null;
        this.open = true;
        var c = doc.querySelector(".overlay-close");
        if (c) setTimeout(function () { c.focus(); }, 30);
      },
      close: function () {
        this.open = false;
        if (opener && opener.focus) opener.focus();
      },
    };
  };

  function works () { return {}; };
  function detail () { return {}; };

  function roster (talents, disciplines, active) {
    return {
      all: talents || [],
      disciplines: disciplines || [],
      discipline: active || (disciplines && disciplines[0]) || "",
      index: 0,
      nameClass: "",
      drift: "0px",
      init: function () {
        var self = this;
        this.$nextTick(function () { self.resize(); });
        window.addEventListener("resize", function () { self.resize(); });
        doc.addEventListener("keydown", function (e) {
          if (e.key === "ArrowRight") self.advance(1);
          if (e.key === "ArrowLeft") self.advance(-1);
        });
      },
      resize: function () {
        var el = this.$refs.name || doc.querySelector(".roster-name");
        if (!el) return;
        el.style.fontSize = "125px";
        var over = el.scrollWidth > window.innerWidth * 0.94;
        this.nameClass = over ? "is-shrunk" : "";
        if (over) {
          var w = el.scrollWidth;
          el.style.fontSize = Math.max(40, Math.floor((125 * window.innerWidth * 0.92) / w)) + "px";
        }
      },
      get set() {
        var self = this;
        return this.all.filter(function (t) { return t.discipline === self.discipline; });
      },
      get visible() { return this.set; },
      get current() {
        var t = this.set[this.index];
        if (!t) return { title: "", slug: "", poster_id: "", alt: "" };
        return t;
      },
      get counterText() {
        var n = this.set.length;
        if (!n) return "";
        return (this.index + 1) + " / " + n;
      },
      choose: function (d) {
        this.discipline = d;
        this.index = 0;
        var m = doc.querySelector(".roster-marker");
        if (m) m.dataset.pos = String(Math.max(0, this.disciplines.indexOf(d)));
        this.announce();
      },
      advance: function (dir) {
        var n = this.set.length;
        if (!n) return;
        this.index = (this.index + dir + n) % n;
        this.announce();
      },
      announce: function () {
        var live = doc.querySelector(".roster-stage");
        if (live) live.setAttribute("aria-label", this.set[this.index].title + ", " + this.discipline);
      },
    };
  };

  function signupForm () {
    return {
      email: "", password: "", busy: false, error: "",
      submit: function () {
        var self = this;
        self.busy = true; self.error = "";
        api("POST", "/api/auth/signup", { email: self.email, password: self.password })
          .then(function () { location.href = "/"; })
          .catch(function (e) { self.error = e.message; })
          .finally(function () { self.busy = false; });
      },
    };
  };

  function loginForm () {
    return {
      email: "", password: "", busy: false, error: "",
      submit: function () {
        var self = this;
        self.busy = true; self.error = "";
        api("POST", "/api/auth/login", { email: self.email, password: self.password })
          .then(function (out) {
            location.href = out.account && out.account.role === "producer" ? "/studio" : "/";
          })
          .catch(function (e) { self.error = e.message; })
          .finally(function () { self.busy = false; });
      },
    };
  };

  window.signOut = function () {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
      .catch(function () {})
      .finally(function () { location.href = "/studio/login"; });
  };

  function palette () {
    return {
      open: false,
      q: "",
      sel: 0,
      items: [],
      actions: [
        { key: "a-nt", kind: "action", kindLabel: "ACTION", title: "New talent", slug: "", go: "/studio/talents/new", stateLabel: "" },
        { key: "a-nw", kind: "action", kindLabel: "ACTION", title: "New work", slug: "", go: "/studio/works/new", stateLabel: "" },
        { key: "a-ro", kind: "action", kindLabel: "ACTION", title: "Reorder index", slug: "", go: "/studio#reorder", stateLabel: "" },
      ],
      init: function () {
        var self = this;
        api("GET", "/api/studio/items").then(function (rows) {
          self.items = rows.map(function (r) {
            return {
              key: r.id, id: r.id, kind: r.kind, kindLabel: r.kind.toUpperCase(),
              title: r.title, slug: r.slug, stateLabel: r.published ? "LIVE" : "UNLISTED",
              go: "/studio/items/" + r.id,
            };
          });
        }).catch(function () { self.items = []; });
      },
      openPalette: function () { this.open = true; var self = this; this.$nextTick(function () { self.$refs.input.focus(); }); },
      closePalette: function () { this.open = false; },
      onEscape: function () { if (this.open) this.closePalette(); },
      focusPalette: function () { this.openPalette(); },
      get results() {
        var q = this.q.trim().toLowerCase();
        // records filter by title and slug; the actions are always offered
        var recs = this.items.filter(function (r) {
          if (!q) return true;
          return (r.title || "").toLowerCase().indexOf(q) > -1 || (r.slug || "").toLowerCase().indexOf(q) > -1;
        });
        return recs.concat(this.actions).slice(0, 14);
      },
      move: function (d) {
        var n = this.results.length;
        if (!n) return;
        this.sel = (this.sel + d + n) % n;
      },
      runSelected: function () { var r = this.results[this.sel]; if (r) this.run(r); },
      run: function (r) {
        if (!r) return;
        if (r.kind === "action") {
          location.href = r.go;
          return;
        }
        location.href = r.go;
      },
      signOut: function () { window.signOut(); },
    };
  };

  function newForm (kind) {
    return {
      kind: kind,
      title: "",
      slug: "",
      discipline: "director",
      variant: "left",
      busy: false,
      error: "",
      submit: function () {
        var self = this;
        self.busy = true; self.error = "";
        var body = { kind: self.kind, title: self.title, slug: slugify(self.slug || self.title) };
        if (self.kind === "talent") body.discipline = self.discipline;
        else body.variant = self.variant;
        api("POST", "/api/studio/items", body)
          .then(function (r) { location.href = "/studio/items/" + r.id; })
          .catch(function (e) { self.error = e.message; })
          .finally(function () { self.busy = false; });
      },
    };
  };

  function editForm (item, talents) {
    return {
      item: item || { media: [], credits: [] },
      form: { title: item ? item.title : "", slug: item ? item.slug : "", discipline: item ? item.discipline : "director", variant: item ? item.variant : "left" },
      media: { role: "poster", width: 598, height: 320, seed: "", alt: "" },
      credit: { role: "", name: "", talent_id: "" },
      talents: talents || [],
      busy: false, busyMedia: false, busyCredit: false,
      error: "", mediaError: "", creditError: "",
      previewUrl: "",
      saveRecord: function () {
        var self = this;
        self.busy = true; self.error = "";
        var body = { title: self.form.title };
        if (self.item.kind === "talent") body.discipline = self.form.discipline;
        else body.variant = self.form.variant;
        if (slugify(self.form.slug) !== self.item.slug) {
          // rename through the dedicated endpoint so the old address redirects
          return api("POST", "/api/studio/items/" + self.item.id + "/slug", { slug: slugify(self.form.slug) })
            .then(function (r) { self.item.slug = r.slug; return api("PATCH", "/api/studio/items/" + self.item.id, body); })
            .then(function (r) { self.item = r; self.error = ""; })
            .catch(function (e) { self.error = e.message; })
            .finally(function () { self.busy = false; });
        }
        api("PATCH", "/api/studio/items/" + self.item.id, body)
          .then(function (r) { self.item = r; })
          .catch(function (e) { self.error = e.message; })
          .finally(function () { self.busy = false; });
      },
      publish: function (want) {
        var self = this;
        self.busy = true; self.error = "";
        api("POST", "/api/studio/items/" + self.item.id + "/publish", { published: want })
          .then(function (r) {
            self.item = r;
            if (want) location.href = "/studio/items/" + self.item.id + "/published";
          })
          .catch(function (e) { self.error = e.message; })
          .finally(function () { self.busy = false; });
      },
      mintPreview: function () {
        var self = this;
        self.busy = true; self.error = "";
        api("POST", "/api/studio/preview-tokens", { item_id: self.item.id })
          .then(function (r) { self.previewUrl = "/preview/" + r.token; })
          .catch(function (e) { self.error = e.message; })
          .finally(function () { self.busy = false; });
      },
      addMedia: function () {
        var self = this;
        self.busyMedia = true; self.mediaError = "";
        var m = { role: self.media.role, width: self.media.width, height: self.media.height, alt: self.media.alt };
        if (self.media.seed) m.seed = self.media.seed;
        api("POST", "/api/studio/items/" + self.item.id + "/media", m)
          .then(function (r) {
            self.item.media.push({ id: r.media_id, role: r.role, width: r.width, height: r.height, alt: r.alt, url: "/api/media/" + r.media_id });
            self.media.alt = ""; self.media.seed = "";
          })
          .catch(function (e) { self.mediaError = e.message; })
          .finally(function () { self.busyMedia = false; });
      },
      addCredit: function () {
        var self = this;
        self.busyCredit = true; self.creditError = "";
        var c = { role: self.credit.role, name: self.credit.name };
        if (self.credit.talent_id) c.talent_id = self.credit.talent_id;
        api("POST", "/api/studio/items/" + self.item.id + "/credits", c)
          .then(function (r) {
            self.item.credits.push(r);
            self.credit = { role: "", name: "", talent_id: "" };
          })
          .catch(function (e) { self.creditError = e.message; })
          .finally(function () { self.busyCredit = false; });
      },
      signOut: function () { window.signOut(); },
    };
  };

  function previewWait () {
    return {
      waiting: true,
      waitText: "Loading preview...",
      init: function () {
        var self = this;
        setTimeout(function () { self.waiting = false; }, 260);
      },
    };
  };

  doc.addEventListener("alpine:init", function () {
    var A = window.Alpine;
    if (!A || !A.data) return;
    A.data("entry", entry);
    A.data("frame", frame);
    A.data("cursor", cursor);
    A.data("overlay", overlay);
    A.data("works", works);
    A.data("detail", detail);
    A.data("roster", roster);
    A.data("signupForm", signupForm);
    A.data("loginForm", loginForm);
    A.data("palette", palette);
    A.data("newForm", newForm);
    A.data("editForm", editForm);
    A.data("previewWait", previewWait);
  });
})();
