/* Cirrus front end: it drives the delivered document and decides nothing about
   who may see a record. One scroll source, one cursor pair, one counter well. */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var coarse = window.matchMedia("(pointer: coarse)");
  var narrow = window.matchMedia("(max-width: 767px), (max-height: 499px)");

  function isReduced() { return reduced.matches; }
  function isNarrow() { return narrow.matches; }

  /* ------------------------------------------------------------ one scroll source */

  var Scroll = {
    target: 0,
    current: 0,
    effects: [],
    idleTimer: null,
    smoothing: true,
    register: function (fn) { this.effects.push(fn); fn(this.current); },
    reset: function () {
      this.effects = [];
      this.target = window.scrollY;
      this.current = window.scrollY;
    },
    markScrolling: function () {
      var root = document.documentElement;
      root.classList.add("is-scrolling");
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(function () {
        root.classList.remove("is-scrolling");
      }, 140);
    },
    maxScroll: function () {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    },
    onWheel: function (e) {
      if (!Scroll.smoothing || isReduced()) return;
      if (document.body.classList.contains("no-scroll")) return;
      if (e.ctrlKey) return;
      var el = e.target;
      while (el && el !== document.body) {
        if (el.hasAttribute && el.hasAttribute("data-native-scroll")) return;
        el = el.parentElement;
      }
      e.preventDefault();
      Scroll.target = Math.min(Scroll.maxScroll(), Math.max(0, Scroll.target + e.deltaY));
      Scroll.markScrolling();
    },
    tick: function (dt) {
      var native = window.scrollY;
      if (!this.smoothing || isReduced()) {
        this.target = native;
        this.current = native;
      } else {
        /* keyboard, anchors and find-in-page move the window themselves: follow them */
        if (Math.abs(native - this.current) > 2 && Math.abs(native - this.target) > 2) {
          this.target = native;
          this.current = native;
        }
        var k = 1 - Math.pow(0.0016, dt / 1000);
        this.current += (this.target - this.current) * k;
        if (Math.abs(this.target - this.current) < 0.4) this.current = this.target;
        if (Math.abs(window.scrollY - this.current) > 0.4) {
          window.scrollTo(0, this.current);
        }
      }
      for (var i = 0; i < this.effects.length; i++) {
        try { this.effects[i](this.current); } catch (err) { /* an effect never breaks the page */ }
      }
    }
  };

  window.addEventListener("wheel", Scroll.onWheel, { passive: false });
  window.addEventListener("scroll", function () { Scroll.markScrolling(); }, { passive: true });
  window.addEventListener("resize", function () { Scroll.reset(); });

  /* ------------------------------------------------------------ the cursor pair */

  var Cursor = {
    el: null, square: null, label: null,
    px: -999, py: -999, x: -999, y: -999,
    active: false, shown: false,
    init: function () {
      this.el = document.getElementById("cursor");
      this.square = document.getElementById("cursor-square");
      this.label = document.getElementById("cursor-label");
      if (!this.el || coarse.matches || isReduced()) return;
      var self = this;
      document.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch") return;
        self.px = e.clientX;
        self.py = e.clientY;
        if (!self.active) {
          self.active = true;
          self.x = e.clientX;
          self.y = e.clientY;
        }
        self.reveal();
        self.describe(e.target);
      }, { passive: true });
      document.addEventListener("pointerleave", function () { self.active = false; });
    },
    reveal: function () {
      if (this.shown || !this.el) return;
      this.shown = true;
      this.el.style.opacity = "0";
      this.el.animate([{ opacity: 0 }, { opacity: 1 }],
        { duration: 300, easing: "ease", fill: "backwards" });
      this.el.style.opacity = "1";
    },
    describe: function (node) {
      if (!this.el) return;
      var el = node, label = "", noSquare = false, up = false;
      while (el && el.nodeType === 1) {
        if (el.hasAttribute("data-no-cursor")) noSquare = true;
        if (el.hasAttribute("data-cursor-up")) up = true;
        if (!label && el.hasAttribute("data-cursor-label")) label = el.getAttribute("data-cursor-label");
        el = el.parentElement;
      }
      this.label.textContent = label ? label.toUpperCase() : "";
      this.square.style.display = noSquare ? "none" : "";
      this.el.classList.toggle("cursor-up", up);
    },
    tick: function (dt) {
      if (!this.el || !this.active) return;
      /* frame-rate independent lag: about 0.08 per frame at 60fps */
      var k = 1 - Math.pow(1 - 0.08, dt / (1000 / 60));
      this.x += (this.px - this.x) * k;
      this.y += (this.py - this.y) * k;
      this.el.style.transform = "translate3d(" + this.x.toFixed(2) + "px," + this.y.toFixed(2) + "px,0)";
    }
  };

  /* ------------------------------------------------------------ one animation frame */

  var last = performance.now();
  function frameLoop(now) {
    var dt = Math.min(64, now - last);
    last = now;
    Scroll.tick(dt);
    Cursor.tick(dt);
    requestAnimationFrame(frameLoop);
  }
  requestAnimationFrame(frameLoop);

  /* ------------------------------------------------------------ the still generator */

  function hashSeed(seed) {
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  var GEN_COLOURS = ["#313236", "#676767", "#333333", "#455e53", "#dedede"];

  function recipe(seed) {
    /* every shift is unsigned: a signed shift yields a negative index and an
       undefined colour stop, which throws inside the canvas gradient */
    var h = hashSeed(seed || "");
    var a = h % 5;
    var b = (a + 1 + ((h >>> 3) % 4)) % 5;
    return {
      from: GEN_COLOURS[a] || GEN_COLOURS[0],
      to: GEN_COLOURS[b] || GEN_COLOURS[1],
      angle: ((h >>> 7) % 360) * Math.PI / 180,
      dir: ((h >>> 5) % 2) ? 1 : -1
    };
  }

  /* ------------------------------------------------------------ reel budget */

  var Reels = { running: [], max: 2 };

  Reels.request = function (tile) {
    if (this.running.indexOf(tile) !== -1) return true;
    if (this.running.length >= this.max) return false;
    this.running.push(tile);
    return true;
  };
  Reels.release = function (tile) {
    var i = this.running.indexOf(tile);
    if (i !== -1) this.running.splice(i, 1);
  };

  function reelsAllowed() {
    if (isReduced()) return false;
    var c = navigator.connection;
    if (c && (c.saveData || /2g/.test(c.effectiveType || ""))) return false;
    return true;
  }

  /* ------------------------------------------------------------ Alpine components */

  window.tile = function (opts) {
    return {
      ready: false,
      revealed: !opts.reveal,
      reelPlaying: false,
      raf: null,
      startedAt: 0,
      init: function () {
        var self = this;
        var node = this.$refs.frame;
        var still = this.$refs.still;
        if (still && still.complete) this.ready = true;

        if (isReduced()) { this.revealed = true; }

        if (opts.reveal && !isReduced() && "IntersectionObserver" in window) {
          var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) { self.revealed = true; io.disconnect(); }
            });
          }, { rootMargin: "0px 0px -10% 0px" });
          io.observe(node);
        } else {
          this.revealed = true;
        }

        if (opts.reel && reelsAllowed()) {
          var near = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) self.maybeStart();
              else self.stop();
            });
          }, { rootMargin: "100% 0px 100% 0px" });
          near.observe(node);
        }
      },
      maybeStart: function () {
        if (this.reelPlaying) return;
        if (!Reels.request(this)) return;
        var canvas = this.$refs.canvas;
        var still = this.$refs.still;
        if (!canvas || !still) { Reels.release(this); return; }
        var ctx;
        try { ctx = canvas.getContext("2d"); } catch (e) { ctx = null; }
        if (!ctx) { Reels.release(this); return; }  /* degrade to the still */
        var rect = this.$refs.frame.getBoundingClientRect();
        canvas.width = Math.max(2, Math.round(Math.min(720, rect.width)));
        canvas.height = Math.max(2, Math.round(canvas.width * (rect.height / Math.max(1, rect.width))));
        this.startedAt = performance.now();
        this.reelPlaying = true;
        canvas.classList.add("is-painted");
        var self = this;
        var r = recipe(opts.reel || opts.seed || "reel");
        function draw(now) {
          if (!self.reelPlaying) return;
          var t = ((now - self.startedAt) / 1000) % 12;      /* a 12 second cycle */
          var phase = t / 12;
          var w = canvas.width, h = canvas.height;
          var shift = r.dir * phase * w * 0.08;
          ctx.clearRect(0, 0, w, h);
          ctx.save();
          ctx.translate(shift, 0);
          var g = ctx.createLinearGradient(0, 0, Math.cos(r.angle) * w, Math.sin(r.angle) * h);
          g.addColorStop(0, r.from);
          g.addColorStop(1, r.to);
          ctx.fillStyle = g;
          ctx.fillRect(-w, 0, w * 3, h);
          ctx.restore();
          /* a second, slower cycle varies brightness by a few percent */
          var b = 0.97 + 0.03 * Math.sin((now - self.startedAt) / 9000 * Math.PI * 2);
          ctx.save();
          ctx.globalCompositeOperation = "source-atop";
          ctx.fillStyle = b > 1 ? "rgba(233,234,228,0.04)" : "rgba(6,4,3,0.04)";
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
          self.raf = requestAnimationFrame(draw);
        }
        this.raf = requestAnimationFrame(draw);
      },
      stop: function () {
        if (!this.reelPlaying) return;
        this.reelPlaying = false;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = null;
        var canvas = this.$refs.canvas;
        if (canvas) {
          var ctx = canvas.getContext && canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          canvas.classList.remove("is-painted");
          canvas.width = 1; canvas.height = 1;      /* release the buffer */
        }
        Reels.release(this);
      }
    };
  };

  window.frame = function () {
    return {
      counterVisible: false,
      counterText: "0%",
      contactOpen: false,
      opener: null,
      trap: null,
      init: function () {
        var self = this;
        window.CirrusFrame = this;
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && self.contactOpen) self.closeContact();
        });
      },
      maybeOverlay: function (e) {
        /* below the breakpoint a nav label handing off to a mail client is unreliable */
        if (isNarrow()) {
          e.preventDefault();
          this.opener = e.currentTarget;
          this.contactOpen = true;
          var panel = document.getElementById("contact-overlay");
          if (!panel) return;
          var self = this;
          setTimeout(function () {
            var focusable = panel.querySelectorAll("a, button");
            if (focusable.length) focusable[0].focus();
          }, 40);
          /* focus is never trapped except inside this overlay while it is open */
          this.trap = function (ev) {
            if (ev.key !== "Tab" || !self.contactOpen) return;
            var items = panel.querySelectorAll("a, button");
            if (!items.length) return;
            var first = items[0];
            var last = items[items.length - 1];
            if (ev.shiftKey && document.activeElement === first) {
              ev.preventDefault(); last.focus();
            } else if (!ev.shiftKey && document.activeElement === last) {
              ev.preventDefault(); first.focus();
            } else if (!panel.contains(document.activeElement)) {
              ev.preventDefault(); first.focus();
            }
          };
          document.addEventListener("keydown", this.trap);
        }
      },
      closeContact: function () {
        this.contactOpen = false;
        if (this.trap) {
          document.removeEventListener("keydown", this.trap);
          this.trap = null;
        }
        /* focus returns to the control that opened it */
        if (this.opener) { this.opener.focus(); this.opener = null; }
      },
      setCounter: function (text, visible) {
        this.counterText = text;
        this.counterVisible = visible;
      }
    };
  };

  /* ------------------------------------------------------------ the entry counter */

  function opticalCentre(el) {
    if (!el) return;
    /* the correction recomputes as the string widens from 0% to 100% */
    var probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:" +
      getComputedStyle(el).font;
    probe.textContent = "%";
    document.body.appendChild(probe);
    var w = probe.getBoundingClientRect().width;
    document.body.removeChild(probe);
    el.style.transform = "translateX(" + (-w / 2).toFixed(4) + "px)";
  }

  window.entryCounter = function () {
    return {
      value: 0,
      cleared: false,
      init: function () {
        var self = this;
        var stills = Array.prototype.slice.call(
          document.querySelectorAll(".cluster-item img")
        );
        /* the defined set: the two font files, the chrome and the cluster's own stills */
        var total = stills.length + 2;
        var done = 0;
        var settle = function () {
          done++;
          self.value = Math.min(99, Math.round((done / total) * 100));
        };
        stills.forEach(function (img) {
          if (img.complete) settle();
          else {
            img.addEventListener("load", settle, { once: true });
            img.addEventListener("error", settle, { once: true });
          }
        });
        var fontsDone = function () { settle(); settle(); };
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(fontsDone).catch(fontsDone);
        } else { fontsDone(); }

        var finish = function () {
          self.value = 100;
          self.report();
          setTimeout(function () { self.cleared = true; }, 220);
        };
        if (document.readyState === "complete") setTimeout(finish, 120);
        else window.addEventListener("load", function () { setTimeout(finish, 120); });

        /* the counter never reaches 100% before the page is ready, and never stalls */
        setTimeout(finish, 6000);

        this.$watch("value", function () { self.report(); });
        this.report();
      },
      report: function () {
        if (window.CirrusFrame) {
          window.CirrusFrame.setCounter(this.value + "%", !this.cleared);
        }
        var el = document.querySelector("#counter-well .counter-value");
        requestAnimationFrame(function () { opticalCentre(el); });
      }
    };
  };

  /* ------------------------------------------------------------ the roster */

  /* the roster's own path curve: flat from 0.572 onward */
  function rosterCurve(t) {
    var pts = [[0, 0], [0.244, 0.14], [0.153, 0.707], [0.388, 0.871], [0.572, 1], [0.723, 1], [1, 1]];
    /* sample the polyline the path describes */
    for (var i = 1; i < pts.length; i++) {
      if (t <= pts[i][0] || i === pts.length - 1) {
        var a = pts[i - 1], b = pts[i];
        var span = Math.max(0.0001, b[0] - a[0]);
        var f = Math.min(1, Math.max(0, (t - a[0]) / span));
        return a[1] + (b[1] - a[1]) * f;
      }
    }
    return 1;
  }

  window.roster = function (talents, disciplines) {
    return {
      all: talents,
      disciplines: disciplines,
      discipline: disciplines.length ? disciplines[0] : null,
      index: 0,
      wheelLock: false,
      init: function () {
        var self = this;
        this.$nextTick(function () { self.placeMarker(); self.report(); });
        if (!isNarrow()) {
          this.$el.addEventListener("wheel", function (e) {
            e.preventDefault();
            if (self.wheelLock) return;
            self.wheelLock = true;
            setTimeout(function () { self.wheelLock = false; }, 520);
            self.advance(e.deltaY > 0 ? 1 : -1);
          }, { passive: false });
        }
        /* the route tree is swapped rather than unmounted, so this listener
           retires itself once its own element has left the document */
        var onKey = function (e) {
          if (!self.$el.isConnected) {
            document.removeEventListener("keydown", onKey);
            return;
          }
          if (document.body.getAttribute("data-route") !== "talents") return;
          var tag = (e.target.tagName || "").toLowerCase();
          if (tag === "input" || tag === "textarea" || tag === "select") return;
          if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); self.advance(1); }
          if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); self.advance(-1); }
        };
        document.addEventListener("keydown", onKey);
      },
      get filtered() {
        var d = this.discipline;
        return this.all.filter(function (t) { return t.discipline === d; });
      },
      select: function (d) {
        this.discipline = d;
        this.index = 0;
        var self = this;
        this.$nextTick(function () { self.placeMarker(); self.report(); });
      },
      advance: function (step) {
        var set = this.filtered;
        if (!set.length) return;
        this.index = (this.index + step + set.length) % set.length;
        this.report();
      },
      isCurrent: function (i) { return i === this.index; },
      nameShift: function (i) {
        if (isReduced()) return "none";
        var d = i - this.index;
        if (d === 0) return "none";
        var t = rosterCurve(Math.min(1, Math.abs(d)));
        return "translateY(" + (d > 0 ? 1 : -1) * t * 60 + "px)";
      },
      placeMarker: function () {
        var marker = document.querySelector(".roster-marker");
        var active = this.$el.querySelector('.roster-filter-item[aria-pressed="true"]');
        if (marker && active) {
          var top = active.getBoundingClientRect().top + active.offsetHeight / 2 - 2;
          marker.style.transform = "translateY(" + (top - 447) + "px)";
        }
      },
      report: function () {
        var set = this.filtered;
        var live = document.getElementById("roster-live");
        if (live && set[this.index]) live.textContent = set[this.index].title;
        if (window.CirrusFrame && isNarrow()) {
          window.CirrusFrame.setCounter((this.index + 1) + " / " + set.length, false);
        }
        var counter = document.getElementById("roster-position");
        if (counter) counter.textContent = set.length ? (this.index + 1) + "/" + set.length : "0/0";
      }
    };
  };

  /* ------------------------------------------------------------ scrubbed effects */

  function registerRouteEffects() {
    Scroll.reset();

    /* the about route's blur and the index's opening line: one blur block unit */
    var blocks = Array.prototype.slice.call(document.querySelectorAll(".blur-block"));
    if (blocks.length) {
      if (isNarrow() || isReduced()) {
        blocks.forEach(function (b) { b.style.filter = "blur(0px)"; b.classList.add("is-sharp"); });
      } else {
        blocks.forEach(function (b) { b.style.transition = "none"; });
        Scroll.register(function () {
          var mid = window.innerHeight / 2;
          blocks.forEach(function (b) {
            var rect = b.getBoundingClientRect();
            var centre = rect.top + rect.height / 2;
            var distance = Math.abs(centre - mid);
            var t = Math.min(1, distance / window.innerHeight);
            b.style.filter = "blur(" + (t * 10).toFixed(2) + "px)";
          });
        });
      }
    }

    /* the footer arrival: the only scroll-driven positional move */
    var footer = document.getElementById("site-footer");
    if (footer) {
      var columns = footer.querySelector(".footer-columns");
      var scrim = footer.querySelector(".footer-scrim");
      footer.style.transition = "opacity 0.4s";
      if (columns) columns.style.transition = "none";
      Scroll.register(function (y) {
        var max = Scroll.maxScroll();
        if (max <= 4) {
          footer.style.transform = "translateY(0)";
          if (columns) columns.style.transform = "translateY(0)";
          if (scrim) scrim.style.opacity = "1";
          return;
        }
        var start = max * 0.66;
        var t = Math.min(1, Math.max(0, (y - start) / Math.max(1, max - start)));
        footer.style.transform = "translateY(" + ((1 - t) * 100).toFixed(2) + "%)";
        if (columns) columns.style.transform = "translateY(" + ((1 - t) * 249.506).toFixed(3) + "px)";
        if (scrim) scrim.style.opacity = t.toFixed(3);
      });
    }

    /* the frame retraction below the breakpoint: a threshold, not a scrub */
    if (isNarrow()) {
      var lastY = 0;
      Scroll.register(function (y) {
        var root = document.documentElement;
        if (y > 160 && y > lastY + 8) root.classList.add("chrome-retracted");
        else if (y < lastY - 8 || y < 120) root.classList.remove("chrome-retracted");
        lastY = y;
      });
    } else {
      document.documentElement.classList.remove("chrome-retracted");
    }
  }

  /* ------------------------------------------------------------ route transition */

  var MARK_HTML = {};

  function sameOrigin(href) {
    try {
      var url = new URL(href, location.href);
      return url.origin === location.origin;
    } catch (e) { return false; }
  }

  function navigate(url, push) {
    var root = document.documentElement;
    var cut = isReduced();
    root.classList.add("is-transitioning");
    var wait = cut ? 0 : 400;

    Promise.all([
      fetch(url, { headers: { "X-Requested-With": "cirrus" }, credentials: "same-origin" })
        .then(function (r) { return r.text().then(function (t) { return { text: t, url: r.url, status: r.status }; }); }),
      new Promise(function (res) { setTimeout(res, wait); })
    ]).then(function (results) {
      var res = results[0];
      var doc = new DOMParser().parseFromString(res.text, "text/html");
      var incoming = doc.getElementById("route-content");
      var current = document.getElementById("route-content");
      if (!incoming || !current) { location.href = url; return; }

      current.innerHTML = incoming.innerHTML;

      /* the frame does not remount: only the centre mark swaps to the route's variant */
      var slotIn = doc.getElementById("centre-mark-slot");
      var slot = document.getElementById("centre-mark-slot");
      if (slotIn && slot) slot.innerHTML = slotIn.innerHTML;

      document.title = doc.title;
      var bodyIn = doc.body;
      document.body.className = bodyIn.className;
      document.body.setAttribute("data-route", bodyIn.getAttribute("data-route") || "");
      document.body.setAttribute("data-mark", bodyIn.getAttribute("data-mark") || "");
      root.className = doc.documentElement.className + " is-transitioning";

      if (push) history.pushState({}, "", res.url || url);
      window.scrollTo(0, 0);
      Scroll.reset();

      document.querySelectorAll(".nav-item").forEach(function (a) { a.removeAttribute("aria-current"); });
      doc.querySelectorAll(".nav-item[aria-current]").forEach(function (a) {
        var match = document.querySelector('.nav-item[href="' + a.getAttribute("href") + '"]');
        if (match) match.setAttribute("aria-current", "page");
      });

      requestAnimationFrame(function () {
        registerRouteEffects();
        root.classList.remove("is-transitioning");
        Analytics.view();
      });
    }).catch(function () {
      location.href = url;
    });
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#") return;
    if (a.target === "_blank" || a.hasAttribute("download")) return;
    if (/^(mailto|tel):/i.test(href)) return;
    if (!sameOrigin(href)) return;
    var url = new URL(href, location.href);
    if (url.pathname.indexOf("/api/") === 0 || url.pathname.indexOf("/static/") === 0) return;
    if (url.pathname === location.pathname && url.search === location.search) { e.preventDefault(); return; }
    e.preventDefault();
    navigate(url.pathname + url.search, true);
  });

  window.addEventListener("popstate", function () {
    navigate(location.pathname + location.search, false);
  });

  /* ------------------------------------------------------------ analytics */

  var Analytics = {
    view: function () {
      try {
        var send = function () {
          fetch("/api/analytics/view", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: location.pathname }),
            keepalive: true
          }).catch(function () { /* a loader that never arrives fails quietly */ });
        };
        if ("requestIdleCallback" in window) requestIdleCallback(send, { timeout: 2000 });
        else setTimeout(send, 800);
      } catch (e) { /* quiet */ }
    }
  };

  /* ------------------------------------------------------------ the command palette */

  /* These factories live in the shipped script rather than in a per-route inline tag,
     because route content is swapped as markup and injected script never executes. */

  window.palette = function (items) {
    return {
      items: items,
      term: "",
      message: "",
      init: function () { if (this.$refs.input) this.$refs.input.focus(); },
      get results() {
        var t = this.term.trim().toLowerCase();
        if (!t) return this.items;
        return this.items.filter(function (i) {
          return i.title.toLowerCase().indexOf(t) !== -1 || i.slug.indexOf(t) !== -1;
        });
      },
      preview: function () {
        var target = this.results[0];
        if (!target) return;
        var self = this;
        this.message = "MINTING A PREVIEW TOKEN...";
        api("/api/studio/preview-tokens", {
          method: "POST", body: JSON.stringify({ item_id: target.id })
        }).then(function (r) {
          if (!r.ok) { self.message = (r.body && r.body.error) || "That could not be minted."; return; }
          location.href = "/preview/" + r.body.token;
        });
      },
      reorder: function () {
        var works = this.items.filter(function (i) { return i.kind === "work"; });
        if (works.length < 2) { this.message = "THERE IS NOTHING TO REORDER."; return; }
        var ids = works.map(function (w) { return w.id; });
        ids.push(ids.shift());
        var self = this;
        api("/api/studio/works/order", {
          method: "POST", body: JSON.stringify({ ordered_ids: ids })
        }).then(function (r) {
          if (!r.ok) { self.message = (r.body && r.body.error) || "That order was refused."; return; }
          self.message = "THE INDEX WAS REORDERED.";
          setTimeout(function () { location.reload(); }, 400);
        });
      },
      signOut: function () {
        api("/api/auth/logout", { method: "POST" }).then(function () { location.href = "/"; });
      }
    };
  };

  window.studioForm = function (item, kind) {
    return {
      item: item || {},
      kind: kind,
      busy: false,
      error: "",
      message: "",
      form: {
        title: (item && item.title) || "",
        slug: (item && item.slug) || "",
        discipline: (item && item.discipline) || "director",
        variant: (item && item.variant) || "left",
        alt: (item && item.poster && item.poster.alt) || "",
        seed: (item && item.poster && item.poster.seed) || "",
        width: (item && item.poster && item.poster.width) || (kind === "talent" ? 246 : 598),
        height: (item && item.poster && item.poster.height) || (kind === "talent" ? 328 : 320)
      },
      init: function () {},
      save: function () {
        /* a rejected form keeps what was typed and names what was wrong */
        this.error = ""; this.message = ""; this.busy = true;
        var self = this;
        if (this.item.id) {
          var body = { title: this.form.title };
          if (this.kind === "talent") body.discipline = this.form.discipline;
          else body.variant = this.form.variant;
          api("/api/studio/items/" + this.item.id, { method: "PATCH", body: JSON.stringify(body) })
            .then(function (r) {
              if (!r.ok) { self.busy = false; self.fail(r); return; }
              self.item = Object.assign({}, self.item, r.body);
              return self.attachPoster(self.item.id).then(function () {
                self.busy = false;
                if (!self.error) self.message = "SAVED.";
              });
            }).catch(function () {
              self.busy = false; self.error = "The studio could not be reached.";
            });
        } else {
          var payload = {
            kind: this.kind,
            title: this.form.title,
            slug: this.form.slug || this.form.title
          };
          if (this.kind === "talent") payload.discipline = this.form.discipline;
          else payload.variant = this.form.variant;
          api("/api/studio/items", { method: "POST", body: JSON.stringify(payload) })
            .then(function (r) {
              if (!r.ok) { self.busy = false; self.fail(r); return; }
              var created = r.body;
              return self.attachPoster(created.id).then(function () {
                location.href = "/studio/items/" + created.id;
              });
            }).catch(function () {
              self.busy = false; self.error = "The studio could not be reached.";
            });
        }
      },
      attachPoster: function (id) {
        if (!this.form.alt && !this.form.seed) return Promise.resolve();
        var self = this;
        return api("/api/studio/items/" + id + "/media", {
          method: "POST",
          body: JSON.stringify({
            role: "poster",
            seed: this.form.seed || this.form.title,
            width: Number(this.form.width) || 598,
            height: Number(this.form.height) || 320,
            alt: this.form.alt
          })
        }).then(function (r) {
          if (!r.ok) { self.error = (r.body && r.body.error) || "The poster was refused."; return; }
          self.item.poster = r.body;
        });
      },
      setPublished: function (published) {
        this.error = ""; this.busy = true;
        var self = this;
        api("/api/studio/items/" + this.item.id + "/publish", {
          method: "POST", body: JSON.stringify({ published: published })
        }).then(function (r) {
          self.busy = false;
          if (!r.ok) { self.fail(r); return; }
          if (published) location.href = "/studio/items/" + self.item.id + "/published";
          else { self.item = Object.assign({}, self.item, r.body); self.message = "UNLISTED."; }
        });
      },
      mintPreview: function () {
        var self = this;
        api("/api/studio/preview-tokens", {
          method: "POST", body: JSON.stringify({ item_id: this.item.id })
        }).then(function (r) {
          if (!r.ok) { self.fail(r); return; }
          location.href = "/preview/" + r.body.token;
        });
      },
      fail: function (r) {
        /* an expired token mid-edit returns to the sign-in route with nothing half saved */
        if (r.status === 401) { location.href = "/studio/login?next=" + location.pathname; return; }
        this.error = (r.body && r.body.error) || "That was refused.";
      }
    };
  };

  /* ------------------------------------------------------------ studio helpers */

  window.api = function (path, options) {
    options = options || {};
    options.credentials = "same-origin";
    options.headers = Object.assign(
      { "Content-Type": "application/json" },
      options.headers || {}
    );
    var token = window.CIRRUS_TOKEN;
    if (token) options.headers["Authorization"] = "Bearer " + token;
    return fetch(path, options).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        return { ok: r.ok, status: r.status, body: body };
      });
    });
  };

  /* ------------------------------------------------------------ boot */

  document.addEventListener("DOMContentLoaded", function () {
    Cursor.init();
    registerRouteEffects();
    Analytics.view();
  });

  window.CirrusScroll = Scroll;
  window.CirrusRegisterEffects = registerRouteEffects;
})();
