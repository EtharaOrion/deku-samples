/* Cirrus front end. It behaves the delivered document: it decides nothing about who may
   see a record. The server refuses the call regardless of what this file drew. */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var TOKEN_KEY = "cirrus_token";

  /* ------------------------------------------------------------ session */

  function token() {
    try { return window.localStorage.getItem(TOKEN_KEY) || readCookie(); }
    catch (e) { return readCookie(); }
  }
  function readCookie() {
    var m = document.cookie.match(/(?:^|;\s*)cirrus_session=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }
  function setSession(value) {
    try { value ? window.localStorage.setItem(TOKEN_KEY, value) : window.localStorage.removeItem(TOKEN_KEY); }
    catch (e) { /* storage refused; the cookie still carries the session */ }
    document.cookie = "cirrus_session=" + encodeURIComponent(value || "") +
      "; path=/; SameSite=Lax; max-age=" + (value ? 43200 : 0);
  }

  function readJson(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  function api(path, options) {
    options = options || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    var t = token();
    if (t) headers.Authorization = "Bearer " + t;
    return fetch(path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin"
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        // An expired session mid-edit returns to the login route with nothing half saved.
        if (res.status === 401 && path.indexOf("/api/studio/") === 0) {
          setSession("");
          window.location.href = "/studio/login?next=" + encodeURIComponent(location.pathname);
        }
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }
  window.cirrusApi = api;

  /* ------------------------------------------------------------ one scroll source */

  var Scroll = {
    target: 0, current: 0, effects: [], raf: null, smoothing: !reduced, flag: false,
    init: function () {
      this.current = this.target = window.scrollY;
      var self = this;
      window.addEventListener("scroll", function () {
        self.target = window.scrollY;
        if (!self.smoothing) self.current = self.target;
        self.mark();
        self.run();
      }, { passive: true });
      window.addEventListener("resize", function () { self.run(); }, { passive: true });
      this.loop();
    },
    mark: function () {
      var self = this;
      if (!this.flag) { this.flag = true; document.documentElement.classList.add("is-scrolling"); }
      clearTimeout(this._t);
      this._t = setTimeout(function () {
        self.flag = false; document.documentElement.classList.remove("is-scrolling");
      }, 140);
    },
    register: function (fn) { this.effects.push(fn); fn(this.current); },
    run: function () {
      for (var i = 0; i < this.effects.length; i++) this.effects[i](this.current);
    },
    loop: function () {
      var self = this, last = performance.now();
      function frame(now) {
        var dt = Math.min((now - last) / 16.6667, 4); last = now;
        if (self.smoothing) {
          var d = self.target - self.current;
          if (Math.abs(d) > 0.05) { self.current += d * (1 - Math.pow(1 - 0.14, dt)); self.run(); }
          else if (self.current !== self.target) { self.current = self.target; self.run(); }
        }
        self.raf = requestAnimationFrame(frame);
      }
      this.raf = requestAnimationFrame(frame);
    }
  };

  /* ------------------------------------------------------------ cursor pair */

  var Cursor = {
    x: -999, y: -999, tx: -999, ty: -999, started: false, el: null, label: null, pair: null,
    init: function () {
      if (coarse || reduced) return;
      this.pair = document.getElementById("cursor-pair");
      this.label = document.getElementById("cursor-label");
      if (!this.pair) return;
      var self = this;
      document.addEventListener("pointermove", function (e) {
        self.tx = e.clientX; self.ty = e.clientY;
        if (!self.started) {
          self.started = true; self.x = self.tx; self.y = self.ty;
          self.pair.animate([{ opacity: 0 }, { opacity: 1 }],
            { duration: 300, easing: "ease", fill: "backwards" });
          self.pair.style.opacity = "1";
        }
        self.describe(e.target);
      }, { passive: true });
      this.loop();
    },
    describe: function (node) {
      var el = node && node.closest ? node.closest("[data-cursor-label], .no-cursor, a, button") : null;
      var labelled = el && el.hasAttribute && el.hasAttribute("data-cursor-label");
      this.pair.classList.toggle("is-labelled", !!labelled);
      this.pair.classList.toggle("is-square-off", !!(el && el.classList.contains("no-cursor")));
      if (labelled) this.label.textContent = el.getAttribute("data-cursor-label");
    },
    loop: function () {
      var self = this, last = performance.now();
      function frame(now) {
        var dt = Math.min((now - last) / 16.6667, 4); last = now;
        var k = 1 - Math.pow(1 - 0.08, dt); // frame-rate independent lag
        self.x += (self.tx - self.x) * k;
        self.y += (self.ty - self.y) * k;
        self.pair.style.transform = "translate3d(" + self.x.toFixed(2) + "px," + self.y.toFixed(2) + "px,0)";
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
  };

  /* ------------------------------------------------------------ letter splitting */
  /* The whole word stays the accessible name; the characters are hidden. */

  function splitLabels(root) {
    (root || document).querySelectorAll("[data-split]").forEach(function (el) {
      if (el.dataset.splitDone) return;
      var text = el.textContent;
      el.dataset.splitDone = "1";
      el.setAttribute("aria-hidden", "true");
      el.textContent = "";
      for (var i = 0; i < text.length; i++) {
        var span = document.createElement("span");
        span.className = "ch";
        span.style.setProperty("--ci", String(i));
        span.textContent = text[i] === " " ? "\u00a0" : text[i];
        el.appendChild(span);
      }
    });
  }

  /* ------------------------------------------------------------ the media layer */
  /* A rendering layer that draws the still and plays a generated reel into the same
     quadrilateral. When it is unavailable, the plain composited image remains, with the
     same layout, the same reveal and the same hover. */

  var Reels = { running: [], max: 2 };

  function canRender() {
    if (reduced) return false;
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext && c.getContext("2d"));
    } catch (e) { return false; }
  }

  function saveData() {
    var c = navigator.connection;
    return !!(c && (c.saveData || /2g/.test(c.effectiveType || "")));
  }

  function startReel(holder) {
    if (reduced || saveData() || !canRender()) return;
    if (holder.dataset.reelOn === "1") return;
    if (Reels.running.length >= Reels.max) return;
    var img = holder.querySelector("[data-tile-img]");
    if (!img || !img.complete || !img.naturalWidth) return;   // the still must be visible first
    var canvas = document.createElement("canvas");
    var w = 480, h = Math.max(1, Math.round(480 * (img.naturalHeight / img.naturalWidth)));
    canvas.width = w; canvas.height = h;
    canvas.className = "tile-canvas";
    canvas.setAttribute("aria-hidden", "true");
    var ctx = canvas.getContext("2d");
    var seedText = holder.dataset.reelSeed || "";
    var dir = (seedText.charCodeAt(0) || 65) % 2 ? 1 : -1;
    var t0 = performance.now();
    var state = { holder: holder, canvas: canvas, stop: null };

    function frame(now) {
      var t = (now - t0) / 1000;
      var phase = (t % 12) / 12;                      // a 12 second cycle
      var shift = Math.sin(phase * Math.PI * 2) * 14 * dir;
      var bright = 1 + Math.sin((t % 31) / 31 * Math.PI * 2) * 0.03;  // a slower second cycle
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.filter = "brightness(" + bright.toFixed(3) + ")";
      ctx.drawImage(img, shift, 0, w + Math.abs(shift), h);
      ctx.restore();
      state.stop = requestAnimationFrame(frame);
    }
    // The still is never replaced by a blank frame: the canvas is layered over it.
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    holder.appendChild(canvas);
    holder.dataset.reelOn = "1";
    state.stop = requestAnimationFrame(frame);
    Reels.running.push(state);
  }

  function stopReel(holder) {
    for (var i = Reels.running.length - 1; i >= 0; i--) {
      if (Reels.running[i].holder === holder) {
        cancelAnimationFrame(Reels.running[i].stop);
        var c = Reels.running[i].canvas;
        if (c && c.parentNode) c.parentNode.removeChild(c);   // the buffer is released
        Reels.running.splice(i, 1);
      }
    }
    holder.dataset.reelOn = "0";
  }

  function observeMedia(root) {
    var reveal = (root || document).querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      reveal.forEach(function (el) { el.classList.add("is-revealed"); });
      return;
    }
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-revealed"); revealer.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });
    reveal.forEach(function (el) { revealer.observe(el); });

    // No reel is prepared until its still is within one window height of the viewport.
    var holders = (root || document).querySelectorAll("[data-media][data-reel]");
    var player = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) startReel(e.target); else stopReel(e.target);
      });
    }, { rootMargin: "100% 0px 100% 0px", threshold: 0.2 });
    holders.forEach(function (el) { player.observe(el); });

    (root || document).querySelectorAll("[data-tile-img]").forEach(function (img) {
      var clear = function () { img.classList.remove("is-placeholder"); };
      if (img.complete) clear(); else { img.addEventListener("load", clear); img.addEventListener("error", clear); }
    });
  }

  /* ------------------------------------------------------------ scrubbed blur */

  function registerBlur(root) {
    var narrow = window.matchMedia("(max-width: 767px), (max-height: 499px)").matches;
    (root || document).querySelectorAll("[data-blur]").forEach(function (el) {
      if (reduced || narrow) { el.style.filter = "blur(0px)"; return; }   // resolves to the end state
      if (el.dataset.blurBound) return;
      el.dataset.blurBound = "1";
      Scroll.register(function () {
        var rect = el.getBoundingClientRect();
        var centre = rect.top + rect.height / 2;
        var mid = window.innerHeight / 2;
        var d = Math.min(Math.abs(centre - mid) / window.innerHeight, 1); // continuous, reversible
        el.style.filter = "blur(" + (d * 10).toFixed(2) + "px)";
      });
    });
  }

  /* ------------------------------------------------------------ footer arrival */

  function registerFooter(root) {
    (root || document).querySelectorAll("[data-footer]").forEach(function (footer) {
      if (footer.dataset.footerBound) return;
      footer.dataset.footerBound = "1";
      Scroll.register(function () {
        var rect = footer.getBoundingClientRect();
        footer.classList.toggle("is-arrived", rect.top < window.innerHeight * 0.9);
      });
    });
  }

  /* ------------------------------------------------------------ frame retraction */

  function registerRetraction() {
    var last = 0;
    Scroll.register(function (y) {
      var narrow = window.matchMedia("(max-width: 767px), (max-height: 499px)").matches;
      if (!narrow) { document.body.classList.remove("nav-retracted"); return; }
      var down = y > last && y > 160;                  // a threshold, not a continuous scrub
      document.body.classList.toggle("nav-retracted", down);
      last = y;
    });
  }

  /* ------------------------------------------------------------ name fitting */
  /* A name that will not fit the window at 125px reduces rather than wrapping. */

  function fitNames(root) {
    (root || document).querySelectorAll("[data-fit]").forEach(function (el) {
      // Start from the authored size every time, so a name that fits keeps its 125px.
      el.style.fontSize = "";
      el.style.lineHeight = "";
      var narrow = window.matchMedia("(max-width: 767px), (max-height: 499px)").matches;
      if (narrow) return;
      var base = parseFloat(getComputedStyle(el).fontSize) || 125;
      var avail = window.innerWidth - 108;   // clear of the filter margin at x = 54 on both sides
      // The name is a full-width centred block, so its own box says nothing about the
      // text: measure the glyphs themselves.
      var range = document.createRange();
      range.selectNodeContents(el);
      var w = range.getBoundingClientRect().width;
      range.detach();
      if (w > avail) {
        var next = Math.max(40, Math.floor(base * (avail / w)));
        el.style.fontSize = next + "px";
        el.style.lineHeight = (next * 1.1).toFixed(1) + "px";
      }
    });
  }

  /* ------------------------------------------------------------ analytics */
  /* Page views and nothing else, after the route is interactive, failing quietly. */

  function countView(path) {
    try {
      if (!window.__cirrusViews) window.__cirrusViews = [];
      window.__cirrusViews.push({ path: path, at: Date.now() });
    } catch (e) { /* a loader that never arrives fails quietly */ }
  }

  /* ------------------------------------------------------------ route transition */
  /* The frame, the counter well, the footer and the outgoing content share one 0.4s fade.
     The persistent tree is never re-rendered: only #route's children are replaced. */

  var Router = {
    init: function () {
      var self = this;
      document.addEventListener("click", function (e) {
        var link = e.target.closest ? e.target.closest("a[data-link]") : null;
        if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        var url = new URL(link.href, location.href);
        if (url.origin !== location.origin) return;
        e.preventDefault();
        self.go(url.pathname + url.search);
      });
      window.addEventListener("popstate", function () { self.go(location.pathname + location.search, true); });
    },
    go: function (path, popped) {
      var body = document.body;
      var site = window.Alpine && Alpine.$data ? Alpine.$data(body) : null;
      var fade = reduced ? 0 : 400;
      if (site) site.leaving = true;
      fetch(path, { headers: { "X-Requested-With": "route" }, credentials: "same-origin" })
        .then(function (res) { return res.text().then(function (html) { return { html: html, url: res.url, status: res.status }; }); })
        .then(function (out) {
          var doc = new DOMParser().parseFromString(out.html, "text/html");
          var incoming = doc.getElementById("route");
          var main = doc.querySelector(".well");
          if (!incoming || !main) { window.location.href = path; return; }
          setTimeout(function () {
            var well = document.querySelector(".well");
            well.innerHTML = main.innerHTML;
            document.title = doc.title;
            document.documentElement.className = doc.documentElement.className;
            var newBody = doc.body;
            body.dataset.route = newBody.dataset.route;
            body.dataset.mark = newBody.dataset.mark;
            if (!popped) history.pushState({}, "", new URL(out.url, location.href).pathname);
            if (window.Alpine) Alpine.initTree(well);
            if (site) { site.route = newBody.dataset.route; site.mark = newBody.dataset.mark; }
            window.scrollTo(0, 0);
            Scroll.target = Scroll.current = 0;
            enhance(well);
            if (site) site.leaving = false;
            countView(location.pathname);
            document.getElementById("content").focus({ preventScroll: true });
          }, fade);
        })
        .catch(function () { window.location.href = path; });
    }
  };

  /* ------------------------------------------------------------ enhancement pass */

  function enhance(root) {
    splitLabels(root);
    observeMedia(root);
    registerBlur(root);
    registerFooter(root);
    fitNames(root);
    Scroll.run();
  }

  /* ------------------------------------------------------------ Alpine components */

  document.addEventListener("alpine:init", function () {
    Alpine.data("site", function () {
      return {
        route: document.body.dataset.route,
        mark: document.body.dataset.mark,
        loading: document.body.dataset.route === "entry",
        leaving: false,
        scrolling: false,
        retracted: false,
        contactOpen: false,
        counterVisible: false,
        counterText: "0%",
        progress: 0,
        boot: function () {
          var self = this;
          if (document.body.dataset.preview === "1") {
            this.counterVisible = false;
          }
          if (this.route === "entry") { this.runCounter(); }
          else { this.loading = false; }
          this._contactOpener = null;
        },
        runCounter: function () {
          // Real progress against a defined set: the fonts, the chrome and the cluster's stills.
          var self = this;
          var imgs = Array.prototype.slice.call(document.querySelectorAll("[data-cluster-img]"));
          var set = imgs.length + 2;   // the two font faces stand in the set beside the stills
          var done = 0;
          this.counterVisible = true;
          function bump() {
            done = Math.min(done + 1, set);
            self.progress = done / set;
            self.counterText = Math.round(self.progress * 100) + "%";
            self.recentre();
            if (done >= set) self.finish();
          }
          imgs.forEach(function (img) {
            if (img.complete && img.naturalWidth) bump();
            else { img.addEventListener("load", bump); img.addEventListener("error", bump); }
          });
          var fonts = document.fonts ? document.fonts.ready : Promise.resolve();
          fonts.then(function () { bump(); bump(); }).catch(function () { bump(); bump(); });
          // A counter that reaches 100% before the page is ready is worse than no counter,
          // so nothing here advances it except a real arrival; this only guards a stall.
          setTimeout(function () { while (done < set) bump(); }, 6000);
        },
        recentre: function () {
          // A mark is centred on the window midpoint by its own rendered width, recomputed
          // as the string widens from 0% to 100%. A static centre drifts by half a character.
          var el = document.getElementById("counter-value");
          var well = document.getElementById("counter-well");
          if (!el || !well) return;
          var self = this;
          this.$nextTick(function () {
            var w = el.getBoundingClientRect().width;
            if (!w) return;
            if (self._baseWidth === undefined) self._baseWidth = w;
            var correction = (self._baseWidth - w) / 2;
            well.style.transform = "translate(-50%, -50%) translateX(" + correction.toFixed(4) + "px)";
          });
        },
        finish: function () {
          var self = this;
          var veil = document.getElementById("load-veil");
          if (veil) veil.classList.add("is-clearing");
          setTimeout(function () {
            self.loading = false;
            self.counterVisible = false;
            countView(location.pathname);
          }, reduced ? 0 : 420);
        },
        maybeOverlay: function (event) {
          var narrow = window.matchMedia("(max-width: 767px), (max-height: 499px)").matches;
          if (!narrow) return;                 // above the breakpoint CONTACT opens a mail composition
          event.preventDefault();
          this._contactOpener = event.currentTarget;
          this.contactOpen = true;
          var self = this;
          this.$nextTick(function () {
            var close = document.querySelector(".overlay-close");
            if (close) close.focus();
          });
        },
        closeContact: function () {
          this.contactOpen = false;
          if (this._contactOpener) this._contactOpener.focus();
        }
      };
    });

    Alpine.data("roster", function () {
      return {
        active: "",
        current: 0,
        count: 0,
        announcement: "",
        entries: [],
        start: function () {
          var self = this;
          this.entries = Array.prototype.slice.call(this.$el.querySelectorAll(".roster-entry"))
            .map(function (el, i) { return { i: i, discipline: el.dataset.discipline, name: el.querySelector(".roster-name").textContent.trim() }; });
          var first = this.$el.querySelector(".filter-control");
          this.active = first ? first.dataset.filter : "";
          this.recount();
          this.$nextTick(function () { self.layout(); });
          window.addEventListener("wheel", function (e) { self.onWheel(e); }, { passive: true });
        },
        matching: function () {
          var self = this;
          return this.entries.filter(function (e) { return e.discipline === self.active; });
        },
        recount: function () {
          var m = this.matching();
          this.count = m.length;
          if (!m.some(function (e) { return e.i === this.current; }, this)) {
            this.current = m.length ? m[0].i : -1;
          }
          this.announce();
        },
        visible: function (index) {
          var e = this.entries[index];
          return !!e && e.discipline === this.active;
        },
        setDiscipline: function (value) {          // filters the set, and does not navigate
          this.active = value;
          var m = this.matching();
          this.current = m.length ? m[0].i : -1;
          this.recount();
          this.layout();
        },
        move: function (step) {
          var m = this.matching();
          if (!m.length) return;
          var at = m.findIndex(function (e) { return e.i === this.current; }, this);
          var next = (at + step + m.length) % m.length;
          this.current = m[next].i;
          this.announce();
          this.layout();
        },
        announce: function () {
          var e = this.entries[this.current];
          this.announcement = e ? e.name + ", " + e.discipline : "";
          var well = document.getElementById("counter-value");
          var m = this.matching();
          if (well && m.length) {
            var at = m.findIndex(function (x) { return x.i === this.current; }, this);
            well.dataset.rosterPosition = (at + 1) + " / " + m.length;
          }
        },
        layout: function () {
          // The roster's own path curve: flat from 0.572 onward, so a name settles rather than slides.
          var m = this.matching(), self = this;
          var at = m.findIndex(function (e) { return e.i === this.current; }, this);
          this.$el.querySelectorAll(".roster-entry").forEach(function (el) {
            var idx = Number(el.dataset.index);
            var pos = m.findIndex(function (e) { return e.i === idx; });
            if (pos < 0) return;
            var narrow = window.matchMedia("(max-width: 767px), (max-height: 499px)").matches;
            if (narrow) { el.style.transform = ""; el.style.opacity = ""; return; }
            var delta = pos - at;
            el.style.transform = "translateY(" + (delta * 100) + "vh)";
            el.style.opacity = delta === 0 ? "1" : "0";
            el.style.transitionTimingFunction = "linear(0, 0.14 24.4%, 0.707 15.3%, 0.871 38.8%, 1 57.2%, 1)";
          });
        },
        onKey: function (event) {
          if (["ArrowDown", "ArrowRight"].indexOf(event.key) >= 0) { event.preventDefault(); this.move(1); }
          if (["ArrowUp", "ArrowLeft"].indexOf(event.key) >= 0) { event.preventDefault(); this.move(-1); }
        },
        onWheel: function (event) {
          var narrow = window.matchMedia("(max-width: 767px), (max-height: 499px)").matches;
          if (narrow) return;
          var now = Date.now();
          if (this._last && now - this._last < 500) return;
          this._last = now;
          this.move(event.deltaY > 0 ? 1 : -1);
        }
      };
    });

    Alpine.data("authForm", function (mode, next) {
      return {
        mode: mode, next: next, email: "", password: "", busy: false, error: "",
        submit: function () {
          var self = this;
          this.error = "";
          if (!this.email || !this.password) { this.error = "An email and a password are required."; return; }
          this.busy = true;
          api("/api/auth/" + this.mode, { method: "POST", body: { email: this.email, password: this.password } })
            .then(function (res) {
              self.busy = false;
              if (!res.ok) { self.error = res.data.error || "That did not work."; return; }
              setSession(res.data.token);
              var account = res.data.account || {};
              if (self.mode === "signup") { window.location.href = "/"; return; }
              window.location.href = account.role === "producer" ? (self.next || "/studio") : "/";
            })
            .catch(function () { self.busy = false; self.error = "The studio could not be reached."; });
        }
      };
    });

    Alpine.data("palette", function (sourceId) {
      var records = readJson(sourceId) || [];
      return {
        term: "", records: records, cursor: 0, reordering: false, busy: false, error: "",
        works: records.filter(function (r) { return r.kind === "work"; }),
        actions: [
          { id: "new-talent", label: "NEW TALENT", href: "/studio/talents/new" },
          { id: "new-work", label: "NEW WORK", href: "/studio/works/new" },
          { id: "reorder", label: "REORDER INDEX" },
          { id: "preview", label: "PREVIEW" }
        ],
        get filtered() {
          var t = this.term.trim().toLowerCase();
          if (!t) return this.records;
          return this.records.filter(function (r) {
            return r.title.toLowerCase().indexOf(t) >= 0 || r.slug.toLowerCase().indexOf(t) >= 0;
          });
        },
        move: function (step) {
          this.cursor = (this.cursor + step + this.actions.length) % this.actions.length;
        },
        choose: function () { this.run(this.actions[this.cursor]); },
        run: function (action) {
          if (action.href) { window.location.href = action.href; return; }
          if (action.id === "reorder") { this.reordering = !this.reordering; return; }
          if (action.id === "preview") {
            var first = this.filtered[0];
            if (!first) { this.error = "Choose a record to preview."; return; }
            var self = this;
            api("/api/studio/preview-tokens", { method: "POST", body: { item_id: first.id } })
              .then(function (res) {
                if (!res.ok) { self.error = res.data.error || "That record could not be previewed."; return; }
                window.location.href = res.data.url;
              });
          }
        },
        bump: function (i, step) {
          var next = i + step;
          if (next < 0 || next >= this.works.length) return;
          var w = this.works.splice(i, 1)[0];
          this.works.splice(next, 0, w);
        },
        saveOrder: function () {
          var self = this;
          this.busy = true; this.error = "";
          api("/api/studio/works/order", {
            method: "POST", body: { ordered_ids: this.works.map(function (w) { return w.id; }) }
          }).then(function (res) {
            self.busy = false;
            if (!res.ok) { self.error = res.data.error || "The order was refused."; return; }
            window.location.reload();
          });
        },
        signOut: function () { setSession(""); window.location.href = "/"; }
      };
    });

    Alpine.data("recordForm", function (recordId, kind, talentsId) {
      var record = readJson(recordId);
      return {
        record: record, kind: kind, talents: readJson(talentsId) || [],
        busy: false, error: "", mediaError: "", creditError: "", publishError: "", notice: "",
        previewUrl: "",
        form: {
          title: record ? record.title : "",
          slug: record ? record.slug : "",
          discipline: record ? (record.discipline || "director") : "director",
          variant: record ? (record.variant || "left") : "left"
        },
        media: { role: "poster", alt: "", width: 598, height: 320, seed: "" },
        credit: { role: "", name: "", talent_id: "" },
        save: function () {
          var self = this;
          this.error = "";
          if (!this.form.title.trim()) { this.error = "A title is required."; return; }
          this.busy = true;
          var body = { title: this.form.title };
          if (this.kind === "talent") body.discipline = this.form.discipline;
          else body.variant = this.form.variant;
          var call = this.record
            ? api("/api/studio/items/" + this.record.id, { method: "PATCH", body: body })
            : api("/api/studio/items", {
                method: "POST",
                body: Object.assign({ kind: this.kind, slug: this.form.slug }, body)
              });
          call.then(function (res) {
            self.busy = false;
            if (!res.ok) { self.error = res.data.error || "That was refused."; return; }  // keeps what was typed
            if (!self.record) { window.location.href = "/studio/items/" + res.data.id; return; }
            self.record = res.data;
            self.notice = "Saved.";
          }).catch(function () { self.busy = false; self.error = "The studio could not be reached."; });
        },
        attachMedia: function () {
          var self = this;
          this.mediaError = "";
          if (!this.media.alt.trim()) { this.mediaError = "A written alternative is required."; return; }
          this.busy = true;
          api("/api/studio/items/" + this.record.id + "/media", { method: "POST", body: this.media })
            .then(function (res) {
              self.busy = false;
              if (!res.ok) { self.mediaError = res.data.error || "That media was refused."; return; }
              self.refresh();
              self.media.alt = "";
            });
        },
        addCredit: function () {
          var self = this;
          this.creditError = "";
          this.busy = true;
          var body = { role: this.credit.role, name: this.credit.name };
          if (this.credit.talent_id) body.talent_id = Number(this.credit.talent_id);
          api("/api/studio/items/" + this.record.id + "/credits", { method: "POST", body: body })
            .then(function (res) {
              self.busy = false;
              if (!res.ok) { self.creditError = res.data.error || "That credit was refused."; return; }
              self.credit = { role: "", name: "", talent_id: "" };
              self.refresh();
            });
        },
        mintPreview: function () {
          var self = this;
          this.publishError = "";
          this.busy = true;
          api("/api/studio/preview-tokens", { method: "POST", body: { item_id: this.record.id } })
            .then(function (res) {
              self.busy = false;
              if (!res.ok) { self.publishError = res.data.error || "No token was minted."; return; }
              self.previewUrl = res.data.url;
              self.notice = "Preview good for 15 minutes.";
            });
        },
        setPublished: function (value) {
          var self = this;
          this.publishError = "";
          this.busy = true;
          api("/api/studio/items/" + this.record.id + "/publish", { method: "POST", body: { published: value } })
            .then(function (res) {
              self.busy = false;
              if (!res.ok) { self.publishError = res.data.error || "That was refused."; return; }
              window.location.href = "/studio/items/" + self.record.id + "/published";
            });
        },
        refresh: function () {
          var self = this;
          api("/api/studio/items/" + this.record.id).then(function (res) {
            if (res.ok) self.record = res.data;
          });
        }
      };
    });
  });

  /* ------------------------------------------------------------ boot */

  function boot() {
    Scroll.init();
    Cursor.init();
    Router.init();
    registerRetraction();
    enhance(document);
    window.addEventListener("resize", function () { fitNames(document); });
    if ("requestIdleCallback" in window) requestIdleCallback(function () { countView(location.pathname); });
    else setTimeout(function () { countView(location.pathname); }, 500);
  }

  // This file is deferred, so the document is parsed by the time it runs.
  boot();
})();
