/* Cirrus front end.
   It owns the rendered document's behaviour and nothing else. It reads what the
   backend already put in the document or answers over /api, and it decides
   nothing about who may see a record. */
(function () {
  "use strict";

  var root = document.documentElement;
  var body = document.body;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var narrow = function () {
    return window.innerWidth <= 768 || window.innerHeight <= 500;
  };

  /* --------------------------------------------------------------------
     Token store. The app's own bearer token, held for studio calls.
     -------------------------------------------------------------------- */
  var Token = {
    get: function () {
      try { return window.localStorage.getItem("cirrus_token") || ""; }
      catch (e) { return readCookie("cirrus_token"); }
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

  function readCookie(name) {
    var parts = ("; " + document.cookie).split("; " + name + "=");
    return parts.length === 2 ? parts.pop().split(";").shift() : "";
  }

  function api(path, options) {
    options = options || {};
    var headers = { "Accept": "application/json" };
    if (options.body) headers["Content-Type"] = "application/json";
    var token = Token.get();
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin"
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        return { ok: response.ok, status: response.status, data: data };
      });
    });
  }
  window.cirrusApi = api;
  window.cirrusToken = Token;

  /* --------------------------------------------------------------------
     One scroll source feeds every scrubbed property on the site.
     -------------------------------------------------------------------- */
  var Scroll = {
    target: 0,
    current: 0,
    effects: [],
    inFlight: false,
    idle: null,
    register: function (fn) { this.effects.push(fn); fn(this.current); },
    start: function () {
      var self = this;
      self.current = self.target = window.scrollY || 0;

      function onScroll() {
        self.target = window.scrollY || 0;
        if (!self.inFlight) {
          self.inFlight = true;
          root.classList.add("is-scrolling");
        }
        clearTimeout(self.idle);
        self.idle = setTimeout(function () {
          self.inFlight = false;
          root.classList.remove("is-scrolling");
        }, 140);
      }
      /* Keyboard scrolling, anchor navigation and find-in-page keep working:
         the native scroll is never prevented, it is only smoothed toward. */
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", function () { self.run(self.current); }, { passive: true });

      function frame() {
        if (reduced) {
          self.current = self.target;
        } else {
          self.current += (self.target - self.current) * 0.14;
          if (Math.abs(self.target - self.current) < 0.4) self.current = self.target;
        }
        self.run(self.current);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    },
    run: function (value) {
      for (var i = 0; i < this.effects.length; i++) this.effects[i](value);
    }
  };

  /* --------------------------------------------------------------------
     The loading counter. Real progress against a defined set: the two font
     files, the chrome and the cluster's own stills. Reels are not fetched.
     -------------------------------------------------------------------- */
  function startCounter() {
    var well = document.querySelector("[data-counter-well]");
    var veil = document.querySelector("[data-loading-veil]");
    if (!well || !veil) return;

    var stills = Array.prototype.slice.call(document.querySelectorAll("[data-cluster-still]"));
    var fonts = 2;
    var total = stills.length + fonts + 1; /* + the chrome */
    var done = 0;
    var shown = 0;
    var isEntry = body.getAttribute("data-route") === "entry";

    var readout = document.createElement("span");
    readout.className = "counter-readout";
    readout.textContent = "0%";
    well.appendChild(readout);

    function paint() {
      var pct = total > 0 ? Math.floor((done / total) * 100) : 100;
      if (pct > shown) shown = pct;
      readout.textContent = shown + "%";
      /* the counter recomputes its own horizontal correction as its string
         widens, so the mark stays optically centred */
      var w = readout.getBoundingClientRect().width;
      readout.style.transform = "translateX(" + (-(w / 2) * 0.235).toFixed(4) + "px)";
      if (done >= total) finish();
    }

    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      shown = 100;
      readout.textContent = "100%";
      /* A counter that reaches 100% before the page is ready is worse than no
         counter: this only runs once every tracked item has settled. */
      window.setTimeout(function () {
        veil.classList.add("is-clear");
        well.setAttribute("data-complete", "true");
        window.setTimeout(function () {
          if (well.contains(readout)) well.removeChild(readout);
          body.classList.remove("is-entering");
        }, 420);
      }, isEntry ? 220 : 0);
    }

    function tick() { done += 1; paint(); }

    stills.forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) { tick(); return; }
      img.addEventListener("load", tick, { once: true });
      img.addEventListener("error", tick, { once: true });
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { tick(); tick(); }).catch(function () { tick(); tick(); });
    } else { tick(); tick(); }

    if (document.readyState === "complete") { tick(); }
    else { window.addEventListener("load", tick, { once: true }); }

    paint();
    /* a loader that never arrives fails quietly rather than putting an error
       screen where the work should be */
    window.setTimeout(finish, 6000);
  }

  /* --------------------------------------------------------------------
     The cursor pair. Two elements at depth 50, frame-rate independent lag.
     -------------------------------------------------------------------- */
  function startCursor() {
    var pair = document.querySelector("[data-cursor]");
    if (!pair || coarse || reduced) return;
    var label = pair.querySelector("[data-cursor-label]");
    var px = -999, py = -999, cx = -999, cy = -999;
    var live = false, last = performance.now();

    document.addEventListener("pointermove", function (event) {
      if (event.pointerType === "touch") return;
      px = event.clientX;
      py = event.clientY;
      if (!live) {
        live = true;
        cx = px; cy = py;
        pair.classList.add("is-live");
      }
      var target = event.target instanceof Element ? event.target : null;
      var named = target ? target.closest("[data-cursor-label]") : null;
      label.textContent = named ? named.getAttribute("data-cursor-label") : "";
      var opted = target ? target.closest(".no-cursor-square") : null;
      pair.classList.toggle("no-square", !!opted);
      var above = target ? target.closest("[data-cursor-above]") : null;
      pair.classList.toggle("label-above", !!above);
    }, { passive: true });

    document.addEventListener("pointerleave", function () { live = false; });

    function frame(now) {
      var dt = Math.min(64, now - last);
      last = now;
      /* interpolate at about 0.08 per frame at 60fps, normalised on elapsed time */
      var k = 1 - Math.pow(1 - 0.08, dt / (1000 / 60));
      cx += (px - cx) * k;
      cy += (py - cy) * k;
      pair.style.transform = "translate3d(" + cx.toFixed(2) + "px," + cy.toFixed(2) + "px,0)";
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* --------------------------------------------------------------------
     The reveal: the wipe, driven from the one scroll source.
     -------------------------------------------------------------------- */
  function startReveals() {
    var items = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
    if (!items.length) return;
    if (reduced) {
      items.forEach(function (el) { el.classList.add("is-revealed"); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          hint(entry.target, "transform, clip-path", 900);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.05 });
    items.forEach(function (el) { observer.observe(el); });
  }

  /* Hint the compositor only for what is currently animating. */
  function hint(el, value, ms) {
    el.style.willChange = value;
    window.setTimeout(function () { el.style.willChange = ""; }, ms);
  }

  /* --------------------------------------------------------------------
     The blur block: continuous and reversible, driven by scroll position.
     Full blur when the block is a screen away, zero at the window's centre.
     -------------------------------------------------------------------- */
  function startBlur() {
    var blocks = Array.prototype.slice.call(document.querySelectorAll("[data-blur-block]"));
    if (!blocks.length) return;
    if (reduced || narrow()) {
      blocks.forEach(function (b) { b.style.filter = "blur(0px)"; });
      return;
    }
    Scroll.register(function () {
      var h = window.innerHeight;
      blocks.forEach(function (block) {
        var rect = block.getBoundingClientRect();
        var centre = rect.top + rect.height / 2;
        var distance = Math.abs(centre - h / 2);
        var ratio = Math.min(1, distance / h);
        var radius = (ratio * 10).toFixed(2);
        block.style.filter = "blur(" + radius + "px)";
      });
    });
  }

  /* --------------------------------------------------------------------
     The footer arrival and the narrow-width frame retraction.
     -------------------------------------------------------------------- */
  function startFooter() {
    var footer = document.querySelector("[data-footer]");
    if (!footer) return;
    if (reduced) { footer.classList.add("is-arrived"); return; }
    Scroll.register(function (y) {
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) { footer.classList.add("is-arrived"); return; }
      var progress = y / docHeight;
      footer.classList.toggle("is-arrived", progress > 0.66);
    });
  }

  function startRetraction() {
    if (!narrow()) return;
    var last = 0;
    Scroll.register(function (y) {
      /* a threshold, not a continuous scrub */
      if (y > 120 && y > last) body.classList.add("is-retracted");
      else if (y < last - 8 || y < 120) body.classList.remove("is-retracted");
      last = y;
    });
  }

  /* --------------------------------------------------------------------
     The media layer. Quadrilaterals in a plane on a canvas, degrading to the
     plain composited image when the rendering layer is unavailable.
     -------------------------------------------------------------------- */
  var ReelLayer = {
    running: [],
    canRender: function () {
      if (reduced) return false;
      if (navigator.connection && (navigator.connection.saveData ||
          /2g/.test(navigator.connection.effectiveType || ""))) return false;
      try {
        var c = document.createElement("canvas");
        return !!(c.getContext && c.getContext("2d"));
      } catch (e) { return false; }
    },
    start: function () {
      var tiles = Array.prototype.slice.call(document.querySelectorAll("[data-reel]"));
      if (!tiles.length || !this.canRender()) return;
      var self = this;
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) self.prepare(entry.target);
          else self.release(entry.target);
        });
      }, { rootMargin: "100% 0px" });  /* one window height */
      tiles.forEach(function (tile) { observer.observe(tile); });
    },
    prepare: function (tile) {
      if (tile._reel || this.running.length >= 2) return;  /* never more than two */
      var img = tile.querySelector("img[data-media]");
      var frame = tile.querySelector(".tile-frame");
      if (!img || !frame) return;
      /* The still must be visible before its reel is ready and must never be
         replaced by a blank frame: the canvas is only attached once it has
         drawn its first frame from the still already on screen. */
      if (!img.complete || img.naturalWidth === 0) {
        img.addEventListener("load", this.prepare.bind(this, tile), { once: true });
        return;
      }
      var canvas = document.createElement("canvas");
      canvas.className = "tile-canvas";
      canvas.setAttribute("aria-hidden", "true");
      var w = canvas.width = 480;
      var h = canvas.height = Math.max(1, Math.round(480 * (img.naturalHeight / img.naturalWidth)));
      var ctx = canvas.getContext("2d");
      var seed = tile.getAttribute("data-reel-seed") || "0";
      var direction = (seed.charCodeAt(0) % 2) ? 1 : -1;
      var startedAt = performance.now();
      var handle = { tile: tile, canvas: canvas, stop: false };

      function draw(now) {
        if (handle.stop) return;
        var t = (now - startedAt) / 1000;
        var phase = ((t % 12) / 12) * w * 0.08 * direction;   /* a 12 second cycle */
        var bright = 1 + Math.sin((t / 19) * Math.PI * 2) * 0.03;
        ctx.clearRect(0, 0, w, h);
        ctx.filter = "brightness(" + bright.toFixed(3) + ")";
        try {
          ctx.drawImage(img, phase, 0, w, h);
          ctx.drawImage(img, phase + (direction > 0 ? -w : w), 0, w, h);
        } catch (e) { handle.stop = true; return; }
        ctx.filter = "none";
        drawGrain(ctx, w, h, t);
        requestAnimationFrame(draw);
      }

      try {
        ctx.drawImage(img, 0, 0, w, h);
      } catch (e) { return; }  /* fails quietly, the still remains */
      frame.appendChild(canvas);
      tile._reel = handle;
      this.running.push(handle);
      requestAnimationFrame(draw);
    },
    release: function (tile) {
      var handle = tile._reel;
      if (!handle) return;
      handle.stop = true;
      if (handle.canvas.parentNode) handle.canvas.parentNode.removeChild(handle.canvas);
      this.running = this.running.filter(function (h) { return h !== handle; });
      tile._reel = null;
    }
  };

  /* one grain tile, generated once and reused */
  var grainTile = null;
  function getGrain() {
    if (grainTile) return grainTile;
    var c = document.createElement("canvas");
    c.width = c.height = 300;
    var ctx = c.getContext("2d");
    var data = ctx.createImageData(300, 300);
    for (var i = 0; i < data.data.length; i += 4) {
      var v = 120 + Math.floor(Math.random() * 90);
      data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
      data.data[i + 3] = 26;
    }
    ctx.putImageData(data, 0, 0);
    grainTile = c;
    return c;
  }

  function drawGrain(ctx, w, h, t) {
    var tile = getGrain();
    var offset = Math.floor(t * 37) % 300;
    ctx.globalAlpha = 0.32;
    for (var x = -offset; x < w; x += 300) {
      for (var y = -offset; y < h; y += 300) ctx.drawImage(tile, x, y);
    }
    ctx.globalAlpha = 1;
  }

  /* --------------------------------------------------------------------
     Media fallback: clear the reserved placeholder on decode or failure.
     -------------------------------------------------------------------- */
  function startMediaFallback() {
    Array.prototype.slice.call(document.querySelectorAll("img[data-media]")).forEach(function (img) {
      function settle() { img.setAttribute("data-settled", "true"); }
      if (img.complete) settle();
      else {
        img.addEventListener("load", settle, { once: true });
        img.addEventListener("error", function () {
          settle();
          img.style.opacity = "0";  /* the layout keeps its reserved space */
        }, { once: true });
      }
    });
  }

  /* --------------------------------------------------------------------
     The route transition. One object turning a page: the frame, the counter
     well, the footer and the outgoing content fade together on 0.4s.
     -------------------------------------------------------------------- */
  function startRouteTransition() {
    document.addEventListener("click", function (event) {
      var link = event.target instanceof Element ? event.target.closest("a[data-route-link]") : null;
      if (!link) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      var href = link.getAttribute("href") || "";
      if (!href.startsWith("/")) return;
      event.preventDefault();
      if (reduced) { window.location.href = href; return; }  /* transitions cut */
      body.classList.add("is-transitioning");
      window.setTimeout(function () { window.location.href = href; }, 400);
    });

    window.addEventListener("pageshow", function () {
      body.classList.remove("is-transitioning");
    });
  }

  /* --------------------------------------------------------------------
     The contact overlay: the narrow-width surface behind CONTACT.
     -------------------------------------------------------------------- */
  function startContact() {
    var overlay = document.querySelector("[data-contact-overlay]");
    var trigger = document.querySelector("[data-contact]");
    if (!overlay || !trigger) return;
    var opener = null;

    function open() {
      opener = document.activeElement;
      overlay.hidden = false;
      window.requestAnimationFrame(function () { overlay.classList.add("is-open"); });
      var focusable = overlay.querySelectorAll("a, button");
      if (focusable.length) focusable[0].focus();
    }
    function close() {
      overlay.classList.remove("is-open");
      overlay.hidden = true;
      if (opener && opener.focus) opener.focus();
    }

    trigger.addEventListener("click", function (event) {
      if (!narrow()) return;  /* above the breakpoint it opens a mail composition */
      event.preventDefault();
      open();
    });
    overlay.querySelector("[data-contact-close]").addEventListener("click", close);
    overlay.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { close(); return; }
      if (event.key !== "Tab") return;
      /* focus is trapped only here, and only while it is open */
      var nodes = Array.prototype.slice.call(overlay.querySelectorAll("a, button"));
      if (!nodes.length) return;
      var first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  /* --------------------------------------------------------------------
     Analytics: waits until the route is interactive, counts page views and
     nothing else, and fails quietly.
     -------------------------------------------------------------------- */
  function startAnalytics() {
    function count() {
      try {
        var key = "cirrus_views";
        var n = parseInt(window.sessionStorage.getItem(key) || "0", 10) + 1;
        window.sessionStorage.setItem(key, String(n));
      } catch (e) { /* fails quietly */ }
    }
    if (document.readyState === "complete") window.setTimeout(count, 0);
    else window.addEventListener("load", function () { window.setTimeout(count, 0); }, { once: true });
  }

  /* --------------------------------------------------------------------
     Alpine components
     -------------------------------------------------------------------- */
  document.addEventListener("alpine:init", function () {
    var Alpine = window.Alpine;

    Alpine.data("roster", function () {
      return {
        discipline: "",
        position: 0,
        count: 0,
        markerIndex: 0,
        announcement: "",
        cards: [],
        disciplines: [],
        init: function () {
          var self = this;
          this.cards = Array.prototype.slice.call(
            this.$el.querySelectorAll("[data-roster-card]"));
          this.disciplines = Array.prototype.slice.call(
            this.$el.querySelectorAll("[data-filter-control]")
          ).map(function (b) { return b.getAttribute("data-discipline"); });
          /* there is no all state: the first discipline is active on arrival */
          this.discipline = this.disciplines[0] || "";
          this.apply(true);

          /* the set advances by wheel or trackpad, one talent at a time */
          var locked = false;
          this.$el.addEventListener("wheel", function (event) {
            if (narrow()) return;
            event.preventDefault();
            if (locked) return;
            locked = true;
            window.setTimeout(function () { locked = false; }, 520);
            self.advance(event.deltaY > 0 ? 1 : -1);
          }, { passive: false });

          if (narrow()) this.trackScroll();
        },
        get shown() {
          var d = this.discipline;
          return this.cards.filter(function (c) {
            return !d || c.getAttribute("data-discipline") === d;
          });
        },
        select: function (d) {
          this.discipline = d;
          this.markerIndex = Math.max(0, this.disciplines.indexOf(d));
          this.position = 0;
          this.apply(false);
        },
        advance: function (step) {
          var shown = this.shown;
          if (!shown.length) return;
          this.position = (this.position + step + shown.length) % shown.length;
          this.apply(false);
        },
        onVertical: function (event, step) {
          if (narrow()) return;   /* below the breakpoint scrolling traverses */
          event.preventDefault();
          this.advance(step);
        },
        apply: function (first) {
          var shown = this.shown;
          this.count = shown.length;
          if (this.position >= shown.length) this.position = 0;
          var current = shown[this.position] || null;
          this.cards.forEach(function (card) {
            var isShown = shown.indexOf(card) !== -1;
            card.hidden = !isShown && !narrow();
            if (!isShown) { card.style.display = "none"; }
            else { card.style.display = ""; }
            var i = shown.indexOf(card);
            card.style.setProperty("--offset", i === -1 ? 0 : i - this.position);
            card.classList.toggle("is-current", card === current);
            var link = card.querySelector(".roster-link");
            if (link) link.setAttribute("tabindex", card === current ? "0" : "-1");
          }, this);
          if (current) {
            this.announcement = current.getAttribute("data-name") || "";
            this.fitName(current);
          } else {
            this.announcement = "";
          }
        },
        fitName: function (card) {
          /* a name that will not fit the window reduces rather than wrapping */
          var name = card.querySelector("[data-roster-name]");
          if (!name || narrow()) return;
          name.style.transform = "";
          var available = window.innerWidth - 160;
          var width = name.scrollWidth;
          if (width > available) {
            name.style.transform = "scale(" + (available / width).toFixed(4) + ")";
          }
        },
        trackScroll: function () {
          var self = this;
          Scroll.register(function () {
            var best = 0, bestDistance = Infinity;
            self.cards.forEach(function (card, i) {
              if (card.style.display === "none") return;
              var rect = card.getBoundingClientRect();
              var distance = Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
              if (distance < bestDistance) { bestDistance = distance; best = i; }
            });
            var shown = self.shown;
            var index = shown.indexOf(self.cards[best]);
            if (index !== -1 && index !== self.position) {
              self.position = index;
              self.announcement = self.cards[best].getAttribute("data-name") || "";
            }
          });
        }
      };
    });

    Alpine.data("signin", function (next) {
      return {
        email: "", password: "", error: "", busy: false,
        submit: function () {
          var self = this;
          if (this.busy) return;
          this.error = "";
          this.busy = true;
          api("/api/auth/login", {
            method: "POST",
            body: { email: this.email, password: this.password }
          }).then(function (r) {
            self.busy = false;
            if (!r.ok) {
              /* a rejected form keeps what was typed and names what was wrong */
              self.error = (r.data && r.data.error) || "That did not work.";
              return;
            }
            Token.set(r.data.token);
            window.location.href = next || "/studio";
          }).catch(function () {
            self.busy = false;
            self.error = "The studio could not be reached.";
          });
        }
      };
    });

    Alpine.data("signup", function () {
      return {
        email: "", password: "", error: "", busy: false, done: false,
        submit: function () {
          var self = this;
          if (this.busy) return;
          this.error = "";
          this.busy = true;
          api("/api/auth/signup", {
            method: "POST",
            body: { email: this.email, password: this.password }
          }).then(function (r) {
            self.busy = false;
            if (!r.ok) { self.error = (r.data && r.data.error) || "That did not work."; return; }
            Token.set(r.data.token);
            self.done = true;
          }).catch(function () {
            self.busy = false;
            self.error = "The studio could not be reached.";
          });
        }
      };
    });

    /* The palette filters the record cards the backend already delivered. */
    Alpine.data("palette", function () {
      return {
        q: "",
        cursor: 0,
        empty: false,
        reordering: false,
        busy: false,
        error: "",
        cards: [],
        init: function () {
          this.cards = Array.prototype.slice.call(
            this.$el.querySelectorAll("[data-record]"));
          this.$watch("q", this.filter.bind(this));
        },
        filter: function () {
          var q = this.q.trim().toLowerCase();
          var shown = 0;
          this.cards.forEach(function (card) {
            var hay = ((card.getAttribute("data-title") || "") + " " +
                       (card.getAttribute("data-slug") || "")).toLowerCase();
            var match = !q || hay.indexOf(q) !== -1;
            card.style.display = match ? "" : "none";
            if (match) shown += 1;
          });
          this.empty = this.cards.length > 0 && shown === 0;
        },
        get shown() {
          return this.cards.filter(function (c) { return c.style.display !== "none"; });
        },
        move: function (step) {
          this.cursor = (this.cursor + step + 4) % 4;
        },
        run: function () { this.go(this.cursor); },
        go: function (which) {
          if (which === 0) { window.location.href = "/studio/talents/new"; return; }
          if (which === 1) { window.location.href = "/studio/works/new"; return; }
          if (which === 2) { this.reordering = true; return; }
          var first = this.shown[0];
          if (!first) { this.error = "There is no record to preview."; return; }
          this.previewOf(first.getAttribute("data-id"));
        },
        previewOf: function (id) {
          var self = this;
          api("/api/studio/preview-tokens", { method: "POST", body: { item_id: Number(id) } })
            .then(function (r) {
              if (!r.ok) { self.error = (r.data && r.data.error) || "That did not work."; return; }
              window.location.href = "/preview/" + r.data.token;
            });
        },
        bump: function (el, step) {
          var row = el.closest("[data-reorder-row]");
          var list = row.parentNode;
          if (step < 0 && row.previousElementSibling) {
            list.insertBefore(row, row.previousElementSibling);
          } else if (step > 0 && row.nextElementSibling) {
            list.insertBefore(row.nextElementSibling, row);
          }
        },
        saveOrder: function () {
          var self = this;
          this.busy = true;
          this.error = "";
          var ids = Array.prototype.slice.call(
            this.$el.querySelectorAll("[data-reorder-row]")
          ).map(function (r) { return Number(r.getAttribute("data-id")); });
          api("/api/studio/works/order", { method: "POST", body: { ordered_ids: ids } })
            .then(function (r) {
              self.busy = false;
              if (!r.ok) { self.error = (r.data && r.data.error) || "That did not work."; return; }
              window.location.reload();
            });
        },
        signOut: function () {
          Token.clear();
          window.location.href = "/";
        }
      };
    });

    Alpine.data("itemForm", function (kind) {
      var island = document.getElementById("studio-item");
      var item = null;
      try { item = island ? JSON.parse(island.textContent) : null; } catch (e) { item = null; }
      return {
        item: item,
        kind: kind,
        busy: false,
        error: "",
        note: "",
        previewUrl: "",
        newSlug: item ? item.slug : "",
        credit: { role: "", name: "" },
        form: {
          title: item ? item.title : "",
          slug: item ? item.slug : "",
          discipline: item ? (item.discipline || "director") : "director",
          variant: item ? (item.variant || "left") : "left",
          alt: "",
          width: kind === "talent" ? 246 : 598,
          height: kind === "talent" ? 330 : 320
        },
        init: function () {
          if (this.item && this.item.media && this.item.media.length) {
            var poster = this.item.media.filter(function (m) { return m.role === "poster"; })[0];
            if (poster) {
              this.form.alt = poster.alt;
              this.form.width = poster.width;
              this.form.height = poster.height;
            }
          }
        },
        expired: function (status) {
          /* an expired token mid-edit returns to the login route with nothing
             half saved */
          if (status === 401 || status === 403) {
            Token.clear();
            window.location.href = "/studio/login?next=" + encodeURIComponent(location.pathname);
            return true;
          }
          return false;
        },
        save: function () {
          var self = this;
          if (this.busy) return;
          this.busy = true;
          this.error = "";
          this.note = "";
          if (this.item) {
            var patch = { title: this.form.title };
            if (this.kind === "talent") patch.discipline = this.form.discipline;
            else patch.variant = this.form.variant;
            api("/api/studio/items/" + this.item.id, { method: "PATCH", body: patch })
              .then(function (r) {
                if (self.expired(r.status)) return;
                if (!r.ok) { self.busy = false; self.error = (r.data && r.data.error) || "That did not work."; return; }
                self.item = r.data;
                return self.savePoster(self.item.id);
              }).then(function () {
                if (!self.busy) return;
                self.busy = false;
                self.note = "SAVED.";
              }).catch(function () { self.busy = false; self.error = "That did not reach the studio."; });
            return;
          }
          var body = {
            kind: this.kind,
            title: this.form.title,
            slug: this.form.slug || this.form.title
          };
          if (this.kind === "talent") body.discipline = this.form.discipline;
          else body.variant = this.form.variant;
          api("/api/studio/items", { method: "POST", body: body }).then(function (r) {
            if (self.expired(r.status)) return;
            if (!r.ok) { self.busy = false; self.error = (r.data && r.data.error) || "That did not work."; return; }
            self.item = r.data;
            return self.savePoster(r.data.id).then(function () {
              window.location.href = "/studio/items/" + r.data.id;
            });
          }).catch(function () { self.busy = false; self.error = "That did not reach the studio."; });
        },
        savePoster: function (id) {
          var self = this;
          if (!this.form.alt) return Promise.resolve();
          var existing = (this.item && this.item.media || []).filter(function (m) {
            return m.role === "poster";
          })[0];
          if (existing && existing.alt === this.form.alt &&
              existing.width === this.form.width && existing.height === this.form.height) {
            return Promise.resolve();
          }
          return api("/api/studio/items/" + id + "/media", {
            method: "POST",
            body: {
              role: "poster",
              alt: self.form.alt,
              width: self.form.width,
              height: self.form.height,
              position: 1
            }
          }).then(function (r) {
            if (!r.ok) { self.error = (r.data && r.data.error) || "The image was refused."; }
            return self.refresh(id);
          });
        },
        refresh: function (id) {
          var self = this;
          return api("/api/studio/items/" + (id || this.item.id)).then(function (r) {
            if (r.ok) self.item = r.data;
          });
        },
        mintPreview: function () {
          var self = this;
          this.busy = true;
          this.error = "";
          api("/api/studio/preview-tokens", { method: "POST", body: { item_id: this.item.id } })
            .then(function (r) {
              self.busy = false;
              if (self.expired(r.status)) return;
              if (!r.ok) { self.error = (r.data && r.data.error) || "That did not work."; return; }
              self.previewUrl = "/preview/" + r.data.token;
              self.note = "A PREVIEW TOKEN IS GOOD FOR 15 MINUTES.";
            });
        },
        publish: function (state) {
          var self = this;
          this.busy = true;
          this.error = "";
          api("/api/studio/items/" + this.item.id + "/publish", {
            method: "POST", body: { published: state }
          }).then(function (r) {
            self.busy = false;
            if (self.expired(r.status)) return;
            if (!r.ok) { self.error = (r.data && r.data.error) || "That did not work."; return; }
            window.location.href = "/studio/items/" + self.item.id + "/published";
          });
        },
        changeSlug: function () {
          var self = this;
          this.busy = true;
          this.error = "";
          api("/api/studio/items/" + this.item.id + "/slug", {
            method: "POST", body: { slug: this.newSlug }
          }).then(function (r) {
            self.busy = false;
            if (self.expired(r.status)) return;
            if (!r.ok) { self.error = (r.data && r.data.error) || "That did not work."; return; }
            self.item = r.data;
            self.note = "THE OLD ADDRESS REDIRECTS FOREVER.";
          });
        },
        addCredit: function () {
          var self = this;
          this.busy = true;
          this.error = "";
          api("/api/studio/items/" + this.item.id + "/credits", {
            method: "POST", body: { role: this.credit.role, name: this.credit.name }
          }).then(function (r) {
            self.busy = false;
            if (self.expired(r.status)) return;
            if (!r.ok) { self.error = (r.data && r.data.error) || "That did not work."; return; }
            self.credit = { role: "", name: "" };
            self.note = "THE CREDIT IS ADDED.";
            self.refresh();
          });
        }
      };
    });
  });

  /* -------------------------------------------------------------------- */
  function boot() {
    body.classList.add("is-entering");
    startCounter();
    startCursor();
    startMediaFallback();
    startReveals();
    startBlur();
    startFooter();
    startRetraction();
    startRouteTransition();
    startContact();
    startAnalytics();
    ReelLayer.start();
    Scroll.start();
    window.setTimeout(function () { body.classList.remove("is-entering"); }, 60);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
