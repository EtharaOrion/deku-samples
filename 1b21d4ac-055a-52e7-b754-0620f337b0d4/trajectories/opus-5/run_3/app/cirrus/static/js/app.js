/* Cirrus front end. It enhances the delivered document in place and decides
   nothing about who may see a record. One scroll source feeds every scrubbed
   effect; motion is declared transitions, scrubbed properties and the two
   runtime transitions on the cursor pair. */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var root = document.documentElement;
  var body = document.body;
  var route = body.dataset.route;

  // One breakpoint, defined once. Asking the same media query the stylesheet
  // asks keeps script and CSS from disagreeing about which layout is current,
  // and is reliable where innerWidth is not.
  var narrowQuery = window.matchMedia("(max-width: 768px), (max-height: 500px)");

  function isNarrow() {
    return narrowQuery.matches;
  }

  /* --------------------------------------------------------------- token -- */

  var Token = {
    get: function () {
      try { return window.localStorage.getItem("cirrus_token") || ""; }
      catch (e) { return readCookie(); }
    },
    set: function (value) {
      try { window.localStorage.setItem("cirrus_token", value); } catch (e) {}
      document.cookie = "cirrus_token=" + value + "; path=/; max-age=43200; SameSite=Lax";
    },
    clear: function () {
      try { window.localStorage.removeItem("cirrus_token"); } catch (e) {}
      document.cookie = "cirrus_token=; path=/; max-age=0; SameSite=Lax";
    }
  };
  function readCookie() {
    var m = document.cookie.match(/(?:^|;\s*)cirrus_token=([^;]*)/);
    return m ? m[1] : "";
  }

  window.cirrusApi = function (path, options) {
    options = options || {};
    var headers = options.headers || {};
    headers["Accept"] = "application/json";
    if (options.body && typeof options.body !== "string") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    var token = Token.get();
    if (token) headers["Authorization"] = "Bearer " + token;
    options.headers = headers;
    return fetch(path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        // An expired token mid-edit returns to the login route with nothing
        // half saved: the server refused, so the store is as it was.
        if (response.status === 401 && path.indexOf("/api/studio/") === 0) {
          Token.clear();
          window.location.href = "/studio/login?next=" + encodeURIComponent(location.pathname);
        }
        return { ok: response.ok, status: response.status, data: data };
      });
    });
  };

  /* -------------------------------------------------- one scroll source --- */

  var Scroll = {
    target: 0,
    current: 0,
    effects: [],
    flag: false,
    smooth: !reduced,
    register: function (fn) { this.effects.push(fn); fn(this.current); },
    init: function () {
      var self = this;
      self.current = self.target = window.scrollY;
      window.addEventListener("scroll", function () {
        self.target = window.scrollY;
        if (!self.smooth) { self.current = self.target; }
        self.mark();
      }, { passive: true });
      function frame() {
        if (self.smooth) {
          self.current += (self.target - self.current) * 0.12;
          if (Math.abs(self.target - self.current) < 0.1) self.current = self.target;
        } else {
          self.current = self.target;
        }
        for (var i = 0; i < self.effects.length; i++) self.effects[i](self.current);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    },
    mark: function () {
      var self = this;
      if (!self.flag) { self.flag = true; root.classList.add("is-scrolling"); }
      clearTimeout(self._t);
      self._t = setTimeout(function () {
        self.flag = false; root.classList.remove("is-scrolling");
      }, 140);
    }
  };

  /* ------------------------------------------------------- cursor pair ---- */

  function initCursor() {
    var pair = document.getElementById("cursor-pair");
    if (!pair || coarse || reduced) return;
    var square = document.getElementById("cursor-square");
    var label = document.getElementById("cursor-label");
    var x = -999, y = -999, tx = -999, ty = -999, seen = false, last = 0;

    // Crossing a route must not return the marker to its parked position, so
    // the last pointer position rides across the navigation with it.
    try {
      var kept = JSON.parse(window.sessionStorage.getItem("cirrus_pointer") || "null");
      if (kept && typeof kept.x === "number") {
        x = tx = kept.x; y = ty = kept.y; seen = true;
        pair.style.transform = "translate3d(" + x + "px," + y + "px,0)";
        pair.classList.add("is-visible");
      }
    } catch (e) { /* quiet */ }

    var keep = function () {
      if (!seen) return;
      try {
        window.sessionStorage.setItem("cirrus_pointer",
          JSON.stringify({ x: tx, y: ty }));
      } catch (e) { /* quiet */ }
    };
    window.addEventListener("pagehide", keep);
    window.addEventListener("beforeunload", keep);

    document.addEventListener("pointermove", function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!seen) {
        seen = true; x = tx; y = ty;
        pair.style.transition = "opacity 300ms ease";
        pair.classList.add("is-visible");
      }
      var el = e.target instanceof Element ? e.target : null;
      var named = el && el.closest("[data-cursor-label]");
      label.textContent = named ? named.getAttribute("data-cursor-label") : "";
      var off = el && el.closest(".no-cursor-square");
      square.classList.toggle("is-off", !!off);
      pair.classList.toggle("is-above", !!(named && named.hasAttribute("data-cursor-above")));
    }, { passive: true });

    function frame(now) {
      var dt = last ? Math.min((now - last) / 16.6667, 4) : 1;
      last = now;
      // frame-rate independent lag: about 0.08 per frame at 60fps
      var k = 1 - Math.pow(1 - 0.08, dt);
      x += (tx - x) * k;
      y += (ty - y) * k;
      pair.style.transform = "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0)";
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------- letter splitting -- */

  function splitLabels() {
    if (reduced) return;
    var nodes = document.querySelectorAll("[data-split]");
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.dataset.splitDone) return;
      var word = node.getAttribute("data-split") || node.textContent;
      node.dataset.splitDone = "1";
      // The accessible name of a split label is the whole word: the characters
      // are hidden and the word is exposed once.
      if (!node.hasAttribute("aria-label")) node.setAttribute("aria-label", word);
      var frag = document.createDocumentFragment();
      var holder = document.createElement("span");
      holder.setAttribute("aria-hidden", "true");
      holder.style.display = "inline-block";
      for (var i = 0; i < word.length; i++) {
        var ch = document.createElement("span");
        ch.textContent = word[i];
        ch.style.display = "inline-block";
        ch.style.whiteSpace = "pre";
        ch.style.transform = "translateY(110%)";
        ch.style.transition = "transform 0.45s cubic-bezier(.83,.12,.35,.96)";
        ch.style.transitionDelay = (i * 0.022).toFixed(3) + "s";
        holder.appendChild(ch);
      }
      frag.appendChild(holder);
      node.textContent = "";
      node.appendChild(frag);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          Array.prototype.forEach.call(holder.children, function (ch) {
            ch.style.transform = "translateY(0)";
          });
        });
      });
    });
  }

  /* ------------------------------------------------- reveal & the media --- */

  function initReveals() {
    var tiles = document.querySelectorAll("[data-tile]");
    if (!tiles.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var tile = entry.target;
        tile.classList.add("is-revealed");
        tile.style.willChange = "transform, clip-path";
        setTimeout(function () { tile.style.willChange = ""; }, 900);
        io.unobserve(tile);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.02 });
    Array.prototype.forEach.call(tiles, function (tile) {
      var img = tile.querySelector("[data-tile-img]");
      if (img) {
        var clear = function () { tile.classList.add("is-loaded"); };
        if (img.complete) clear();
        // clears its placeholder on decode or on failure alike
        img.addEventListener("load", clear);
        img.addEventListener("error", clear);
      } else {
        tile.classList.add("is-loaded");
      }
      if (tile.classList.contains("reveal")) io.observe(tile);
      else tile.classList.add("is-revealed");
    });
    initReels();
  }

  /* The rendering layer: a reel is a generated motion field drawn per frame
     into the tile's own quadrilateral, in place of its still, without changing
     its geometry. Degrades to the composited still when unavailable. */
  var reels = { playing: [], candidates: [] };

  function initReels() {
    var saveData = (navigator.connection && (navigator.connection.saveData ||
      /2g/.test(navigator.connection.effectiveType || ""))) || false;
    if (reduced || saveData) return;
    var nodes = document.querySelectorAll("[data-reel-seed]");
    if (!nodes.length) return;
    reels.candidates = Array.prototype.slice.call(nodes);
    reels.candidates.forEach(function (tile) { tile._reel = { on: false, raf: 0 }; });
    var tick = function () { pumpReels(); setTimeout(tick, 400); };
    tick();
  }

  function inWindowRange(tile, factor) {
    var r = tile.getBoundingClientRect();
    var h = window.innerHeight;
    return r.bottom > -h * factor && r.top < h * (1 + factor);
  }

  function pumpReels() {
    var running = 0;
    reels.candidates.forEach(function (tile) {
      var near = inWindowRange(tile, 1);
      var visible = inWindowRange(tile, 0);
      if (tile._reel.on) {
        if (!near) { stopReel(tile); }
        else if (!visible) { stopReel(tile); }
        else { running++; }
      }
    });
    reels.candidates.forEach(function (tile) {
      // never more than two run at once
      if (running >= 2) return;
      if (tile._reel.on) return;
      if (!inWindowRange(tile, 0)) return;
      startReel(tile);
      running++;
    });
  }

  function startReel(tile) {
    var canvas = tile.querySelector("[data-reel-canvas]");
    var img = tile.querySelector("[data-tile-img]");
    if (!canvas || !img) return;
    var ctx = null;
    try { ctx = canvas.getContext("2d"); } catch (e) { ctx = null; }
    if (!ctx) return;  // the still remains; the layer carries smoothness, not content
    var seedSum = 0, id = tile.getAttribute("data-reel-seed") || "";
    for (var i = 0; i < id.length; i++) seedSum += id.charCodeAt(i);
    var dir = seedSum % 2 ? 1 : -1;
    var w = Math.max(2, Math.round(tile.clientWidth / 2));
    var h = Math.max(2, Math.round(tile.clientHeight / 2));
    canvas.width = w; canvas.height = h;
    tile._reel.on = true;
    var start = performance.now();
    function frame(now) {
      if (!tile._reel.on) return;
      var t = (now - start) / 1000;
      var phase = ((t % 12) / 12) * dir;
      if (!img.complete || !img.naturalWidth) {
        // The still must be visible before its reel is ready: draw nothing yet.
        tile._reel.raf = requestAnimationFrame(frame);
        return;
      }
      ctx.clearRect(0, 0, w, h);
      var shift = phase * w * 0.08;
      ctx.globalAlpha = 1;
      ctx.drawImage(img, shift, 0, w, h);
      ctx.drawImage(img, shift - (dir > 0 ? w : -w), 0, w, h);
      // a few percent of brightness on a second slower cycle
      var lift = 0.03 * Math.sin(t / 9);
      ctx.globalAlpha = Math.abs(lift);
      ctx.fillStyle = lift > 0 ? "#dedede" : "#333333";
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      canvas.classList.add("is-playing");
      tile._reel.raf = requestAnimationFrame(frame);
    }
    tile._reel.raf = requestAnimationFrame(frame);
  }

  function stopReel(tile) {
    tile._reel.on = false;
    cancelAnimationFrame(tile._reel.raf);
    var canvas = tile.querySelector("[data-reel-canvas]");
    if (canvas) {
      canvas.classList.remove("is-playing");
      canvas.width = 1; canvas.height = 1;  // release the buffer
    }
  }

  /* ------------------------------------------------------ scrubbed blur --- */

  function initBlur() {
    var blocks = document.querySelectorAll("[data-blur-block]");
    if (!blocks.length) return;
    if (reduced || isNarrow()) {
      // resolves to its end state: the reader gets the sharp text
      Array.prototype.forEach.call(blocks, function (b) { b.classList.add("is-sharp"); });
      return;
    }
    Scroll.register(function () {
      var h = window.innerHeight;
      Array.prototype.forEach.call(blocks, function (b) {
        var r = b.getBoundingClientRect();
        var centre = r.top + r.height / 2;
        var distance = Math.abs(centre - h / 2);
        // full blur a screen away, zero when its centre reaches the centre;
        // continuous and reversible, so scrolling back re-blurs
        var amount = Math.min(1, distance / h);
        b.style.filter = "blur(" + (amount * 10).toFixed(2) + "px)";
      });
    });
  }

  /* ---------------------------------------------- footer & retraction ----- */

  function initFooter() {
    var footer = document.getElementById("site-footer");
    if (!footer) return;
    Scroll.register(function () {
      var doc = document.documentElement.scrollHeight - window.innerHeight;
      if (doc <= 40) { footer.classList.add("is-arrived"); return; }
      var progress = window.scrollY / doc;
      footer.classList.toggle("is-arrived", progress > 0.67);
    });
  }

  function initRetraction() {
    if (route !== "works" && route !== "about") return;
    var lastY = 0;
    Scroll.register(function () {
      if (!isNarrow()) { body.classList.remove("is-retracted"); return; }
      var y = window.scrollY;
      // a threshold, not a continuous scrub
      if (y > 160 && y > lastY) body.classList.add("is-retracted");
      else if (y < lastY - 4 || y < 120) body.classList.remove("is-retracted");
      lastY = y;
    });
  }

  /* ------------------------------------------------------- the counter ---- */

  function initCounter() {
    var well = document.getElementById("counter-well");
    var figure = document.getElementById("counter-figure");
    if (!well || !figure) return;

    if (route === "preview") {
      figure.textContent = "Loading preview...";
      figure.classList.add("display", "title-case");
    }

    // The counter reports real progress against a defined set: the fonts, the
    // chrome and this route's own stills. Reels are not fetched at this point.
    var assets = Array.prototype.slice.call(document.querySelectorAll("[data-tile-img]"));
    var total = assets.length + 2;
    var done = 0;
    var shown = 0;

    function credit() { done = Math.min(total, done + 1); }
    assets.forEach(function (img) {
      if (img.complete) credit();
      else {
        img.addEventListener("load", credit);
        img.addEventListener("error", credit);  // a failure still counts as settled
      }
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(credit, credit);
    } else { credit(); }
    if (document.readyState === "complete") credit();
    else window.addEventListener("load", credit);

    var deadline = performance.now() + 6000;
    function frame(now) {
      var real = total ? done / total : 1;
      var ready = document.readyState === "complete";
      var ceiling = ready ? 1 : 0.92;
      // never reaches 100% before the page is ready
      var goal = Math.min(real, ceiling);
      shown += (goal - shown) * 0.09;
      if (now > deadline) shown = Math.max(shown, ready ? 1 : shown);
      var pct = Math.min(100, Math.round(shown * 100));
      if (real >= 1 && ready && pct > 97) pct = 100;
      figure.textContent = route === "preview" ? "Loading preview..." : pct + "%";
      // optical centring recomputed as the string widens
      if (route !== "preview") {
        figure.style.transform = "translateX(" + (-figure.offsetWidth * 0.354).toFixed(4) + "px)";
      }
      if (pct >= 100 && real >= 1 && ready) {
        well.classList.add("is-done");
        body.classList.add("is-entered");
        splitLabels();
        return;
      }
      requestAnimationFrame(frame);
    }
    if (route === "preview") { well.classList.remove("is-veiled"); }
    requestAnimationFrame(frame);
    // The veil never traps the route: past the deadline it clears regardless.
    setTimeout(function () { well.classList.add("is-done"); splitLabels(); }, 7000);
  }

  /* ----------------------------------------------- the route transition --- */

  function initRouteTransition() {
    if (reduced) return;  // route transitions cut rather than fade
    document.addEventListener("click", function (e) {
      var link = e.target instanceof Element ? e.target.closest("a[data-nav]") : null;
      if (!link) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      var url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname) return;
      e.preventDefault();
      // The frame, the counter well, the footer and the outgoing content take
      // one state class and fade together on opacity 0.4s. The cursor pair at
      // depth 50 sits above the veil and does not participate.
      body.classList.add("is-transitioning");
      setTimeout(function () { location.href = url.href; }, 400);
    });
    window.addEventListener("pageshow", function () {
      body.classList.remove("is-transitioning");
    });
  }

  /* ------------------------------------------------------- analytics ------ */

  function initAnalytics() {
    // Waits until the route is interactive, counts page views and nothing else,
    // and fails quietly rather than putting an error screen where the work is.
    var send = function () {
      try {
        var key = "cirrus_views";
        var n = parseInt(window.sessionStorage.getItem(key) || "0", 10) + 1;
        window.sessionStorage.setItem(key, String(n));
      } catch (e) { /* quiet */ }
    };
    if (document.readyState === "complete") setTimeout(send, 0);
    else window.addEventListener("load", function () { setTimeout(send, 0); });
  }

  /* ------------------------------------------------ Alpine components ----- */

  document.addEventListener("alpine:init", function () {
    window.Alpine.data("site", function () {
      return {
        contactOpen: false,
        _opener: null,
        init: function () {},
        isNarrow: isNarrow,
        openContact: function (opener) {
          this._opener = opener || null;
          this.contactOpen = true;
          var overlay = document.getElementById("contact-overlay");
          overlay.classList.add("is-open");
          // Its own lock, so closing it cannot strip a lock the route owns.
          body.classList.add("overlay-open");
          var focusable = overlay.querySelectorAll("a, button");
          if (focusable.length) focusable[0].focus();
          this._trap = function (e) {
            if (e.key === "Escape") { window.dispatchEvent(new CustomEvent("close-contact")); return; }
            if (e.key !== "Tab" || !focusable.length) return;
            var first = focusable[0], last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
          };
          document.addEventListener("keydown", this._trap);
          var self = this;
          window.addEventListener("close-contact", function once() {
            window.removeEventListener("close-contact", once);
            self.closeContact();
          });
        },
        closeContact: function () {
          this.contactOpen = false;
          document.getElementById("contact-overlay").classList.remove("is-open");
          body.classList.remove("overlay-open");
          if (this._trap) document.removeEventListener("keydown", this._trap);
          if (this._opener) this._opener.focus();
        }
      };
    });

    window.Alpine.data("roster", function () {
      return {
        active: "",
        index: 0,
        entries: [],
        announce: "",
        init: function () {
          var self = this;
          this.entries = Array.prototype.slice.call(
            document.querySelectorAll("[data-roster-entry]"));
          var first = document.querySelector(".filter-item");
          this.active = first ? first.getAttribute("data-discipline") : "";
          this.index = 0;
          this.sync();
          if (isNarrow()) return;
          // wheel or trackpad advances the set one talent at a time
          var lock = false;
          window.addEventListener("wheel", function (e) {
            if (isNarrow()) return;
            e.preventDefault();
            if (lock) return;
            if (Math.abs(e.deltaY) < 8) return;
            lock = true;
            setTimeout(function () { lock = false; }, 520);
            self.advance(e.deltaY > 0 ? 1 : -1);
          }, { passive: false });
        },
        visible: function () {
          var self = this;
          return this.entries.filter(function (e) {
            return e.getAttribute("data-discipline") === self.active;
          });
        },
        get total() { return this.visible().length; },
        get position() { return this.total ? this.index + 1 : 0; },
        isActive: function (i) {
          var v = this.visible();
          return !!v[this.index] && Number(v[this.index].dataset.index) === i;
        },
        sync: function () {
          var v = this.visible();
          if (this.index >= v.length) this.index = 0;
          var current = v[this.index];
          this.announce = current ? current.getAttribute("data-name") : "";
        },
        select: function (discipline) {
          // filtering does not navigate; one discipline is always active
          this.active = discipline;
          this.index = 0;
          this.sync();
        },
        advance: function (step) {
          var v = this.visible();
          if (!v.length) return;
          this.index = (this.index + step + v.length) % v.length;
          this.sync();
        },
        onKey: function (e) {
          if (isNarrow()) return;
          var tag = document.activeElement && document.activeElement.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA") return;
          if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); this.advance(1); }
          else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); this.advance(-1); }
        }
      };
    });

    window.Alpine.data("authForm", function (endpoint, nextPath) {
      return {
        email: "", password: "", error: "", busy: false,
        submit: function () {
          var self = this;
          if (self.busy) return;
          self.error = "";
          self.busy = true;
          window.cirrusApi(endpoint, {
            method: "POST",
            body: { email: self.email, password: self.password }
          }).then(function (r) {
            self.busy = false;
            if (!r.ok) {
              // a rejected form keeps what was typed and names what was wrong
              self.error = r.data.error || "That did not work.";
              return;
            }
            Token.set(r.data.token);
            var account = r.data.account || {};
            if (account.role === "producer" || endpoint.indexOf("login") > -1) {
              window.location.href = nextPath || "/studio";
            } else {
              window.location.href = "/";
            }
          }).catch(function () {
            self.busy = false;
            self.error = "The studio could not be reached. Try again.";
          });
        }
      };
    });

    window.Alpine.data("palette", function () {
      return {
        term: "", items: [], loading: true, cursor: 0,
        reordering: false, ordered: [], orderNote: "",
        load: function () {
          var self = this;
          window.cirrusApi("/api/studio/items").then(function (r) {
            self.loading = false;
            if (r.ok && Array.isArray(r.data)) self.items = r.data;
          }).catch(function () { self.loading = false; });
        },
        actions: function () {
          var t = this.term.trim().toLowerCase();
          var all = [
            { id: "new-talent", label: "New talent", hint: "CREATE", href: "/studio/talents/new" },
            { id: "new-work", label: "New work", hint: "CREATE", href: "/studio/works/new" },
            { id: "reorder", label: "Reorder index", hint: "WORKS", action: "reorder" },
            { id: "preview", label: "Preview", hint: "MINT A TOKEN", action: "preview" }
          ];
          if (!t) return all;
          return all.filter(function (a) { return a.label.toLowerCase().indexOf(t) > -1; });
        },
        matches: function () {
          var t = this.term.trim().toLowerCase();
          if (!t) return this.items;
          return this.items.filter(function (r) {
            return r.title.toLowerCase().indexOf(t) > -1 || r.slug.indexOf(t) > -1;
          });
        },
        works: function () {
          if (this.ordered.length) return this.ordered;
          return this.items.filter(function (r) { return r.kind === "work"; });
        },
        move: function (i, step) {
          var list = this.works().slice();
          var j = i + step;
          if (j < 0 || j >= list.length) return;
          var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
          this.ordered = list;
        },
        saveOrder: function () {
          var self = this;
          var ids = self.works().map(function (w) { return w.id; });
          window.cirrusApi("/api/studio/works/order", {
            method: "POST", body: { ordered_ids: ids }
          }).then(function (r) {
            self.orderNote = r.ok ? "ORDER SAVED." : (r.data.error || "THAT WAS REFUSED.");
            if (r.ok) self.load();
          });
        },
        run: function (a) {
          if (a.href) { window.location.href = a.href; return; }
          if (a.action === "reorder") { this.reordering = true; return; }
          if (a.action === "preview") {
            var first = this.matches()[0];
            if (!first) { this.orderNote = "TYPE A RECORD NAME FIRST."; return; }
            window.cirrusApi("/api/studio/preview-tokens", {
              method: "POST", body: { item_id: first.id }
            }).then(function (r) {
              if (r.ok) window.location.href = r.data.preview_path;
            });
          }
        },
        onKey: function (e) {
          var length = this.actions().length + this.matches().length;
          if (e.key === "ArrowDown") { e.preventDefault(); this.cursor = (this.cursor + 1) % length; }
          else if (e.key === "ArrowUp") { e.preventDefault(); this.cursor = (this.cursor - 1 + length) % length; }
          else if (e.key === "Enter") {
            e.preventDefault();
            var acts = this.actions();
            if (this.cursor < acts.length) this.run(acts[this.cursor]);
            else {
              var rec = this.matches()[this.cursor - acts.length];
              if (rec) window.location.href = "/studio/items/" + rec.id;
            }
          }
        },
        signOut: function () {
          Token.clear();
          window.location.href = "/";
        }
      };
    });

    window.Alpine.data("recordForm", function (kind) {
      return {
        item: {},
        kind: kind,
        form: {},
        error: "", note: "", busy: false, previewPath: "",
        init: function () {
          var node = document.getElementById("record-json");
          try { this.item = (node && JSON.parse(node.textContent)) || {}; }
          catch (e) { this.item = {}; }
          var poster = (this.item.media || []).filter(function (m) {
            return m.role === "poster";
          })[0];
          this.form = {
            title: this.item.title || "",
            slug: this.item.slug || "",
            discipline: this.item.discipline || "director",
            variant: this.item.variant || "left",
            alt: poster ? poster.alt : "",
            seed: poster ? (this.item.slug || "seed") + "-poster" : "",
            width: poster ? poster.width : (kind === "talent" ? 246 : 598),
            height: poster ? poster.height : (kind === "talent" ? 328 : 320)
          };
        },
        save: function () {
          var self = this;
          if (self.busy) return;
          self.error = ""; self.note = ""; self.busy = true;
          var done = function (r) {
            self.busy = false;
            if (!r.ok) { self.error = r.data.error || "That was refused."; return null; }
            return r.data;
          };
          if (!self.item.id) {
            window.cirrusApi("/api/studio/items", {
              method: "POST",
              body: {
                kind: self.kind, title: self.form.title, slug: self.form.slug,
                discipline: self.form.discipline, variant: self.form.variant
              }
            }).then(function (r) {
              var created = done(r);
              if (!created) return;
              return self.attachPoster(created.id).then(function () {
                window.location.href = "/studio/items/" + created.id;
              });
            }).catch(function () {
              self.busy = false; self.error = "The studio could not be reached.";
            });
            return;
          }
          var patch = window.cirrusApi("/api/studio/items/" + self.item.id, {
            method: "PATCH",
            body: {
              title: self.form.title, discipline: self.form.discipline,
              variant: self.form.variant
            }
          });
          patch.then(function (r) {
            var updated = done(r);
            if (!updated) return;
            var chain = Promise.resolve(updated);
            if (self.form.slug && self.form.slug !== self.item.slug) {
              chain = window.cirrusApi("/api/studio/items/" + self.item.id + "/slug", {
                method: "POST", body: { slug: self.form.slug }
              }).then(function (sr) {
                if (!sr.ok) { self.error = sr.data.error || "That slug was refused."; return updated; }
                return sr.data;
              });
            }
            return chain.then(function (fresh) {
              var poster = (fresh.media || []).filter(function (m) { return m.role === "poster"; })[0];
              var needsPoster = !poster || (self.form.alt && poster.alt !== self.form.alt);
              var after = needsPoster ? self.attachPoster(self.item.id) : Promise.resolve();
              return after.then(function () { return self.refresh(); });
            });
          }).catch(function () {
            self.busy = false; self.error = "The studio could not be reached.";
          });
        },
        attachPoster: function (id) {
          var self = this;
          if (!self.form.alt) return Promise.resolve();
          return window.cirrusApi("/api/studio/items/" + id + "/media", {
            method: "POST",
            body: {
              role: "poster", seed: self.form.seed || (self.form.slug + "-poster"),
              width: self.form.width, height: self.form.height, alt: self.form.alt
            }
          }).then(function (r) {
            if (!r.ok) self.error = r.data.error || "The poster was refused.";
          });
        },
        refresh: function () {
          var self = this;
          return window.cirrusApi("/api/studio/items/" + self.item.id).then(function (r) {
            self.busy = false;
            if (r.ok) { self.item = r.data; self.note = "SAVED."; }
          });
        },
        mintPreview: function () {
          var self = this;
          self.error = ""; self.note = "";
          window.cirrusApi("/api/studio/preview-tokens", {
            method: "POST", body: { item_id: self.item.id }
          }).then(function (r) {
            if (!r.ok) { self.error = r.data.error || "That was refused."; return; }
            self.previewPath = r.data.preview_path;
            self.note = "A PREVIEW TOKEN IS GOOD FOR 15 MINUTES.";
          });
        },
        setPublished: function (published) {
          var self = this;
          self.error = ""; self.note = "";
          window.cirrusApi("/api/studio/items/" + self.item.id + "/publish", {
            method: "POST", body: { published: published }
          }).then(function (r) {
            if (!r.ok) { self.error = r.data.error || "That was refused."; return; }
            window.location.href = "/studio/items/" + self.item.id + "/published";
          });
        }
      };
    });
  });

  /* --------------------------------------------------------------- boot --- */

  function boot() {
    Scroll.init();
    initCursor();
    initReveals();
    initBlur();
    initFooter();
    initRetraction();
    initCounter();
    initRouteTransition();
    initAnalytics();
    // Three surfaces never scroll and the rest do. The entry route and the
    // preview never scroll at any width; the roster does not scroll above the
    // breakpoint but becomes a scroll below it, so this is re-evaluated on
    // resize rather than decided once.
    var applyScrollLock = function () {
      var locked = route === "entry" || route === "preview" ||
        (route === "talents" && !isNarrow());
      root.classList.toggle("no-scroll", locked);
      body.classList.toggle("no-scroll", locked);
    };
    applyScrollLock();
    if (narrowQuery.addEventListener) narrowQuery.addEventListener("change", applyScrollLock);
    else if (narrowQuery.addListener) narrowQuery.addListener(applyScrollLock);
    window.addEventListener("resize", applyScrollLock);
    window.addEventListener("orientationchange", applyScrollLock);
    // A token in storage is mirrored to the cookie so a document request to a
    // studio route is authenticated too.
    var token = Token.get();
    if (token && !readCookie()) Token.set(token);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();
