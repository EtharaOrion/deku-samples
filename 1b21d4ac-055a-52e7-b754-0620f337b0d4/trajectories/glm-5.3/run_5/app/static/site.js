/* Cirrus front end: the rendered document's behaviour and nothing else. */
(function () {
  "use strict";

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE = window.matchMedia("(pointer: coarse)").matches;

  function token() {
    try { return localStorage.getItem("cirrus.token") || ""; } catch (e) { return ""; }
  }
  function setToken(value) {
    try {
      if (value) { localStorage.setItem("cirrus.token", value); }
      else { localStorage.removeItem("cirrus.token"); }
    } catch (e) { /* a private window still works */ }
  }
  function authHeaders() {
    var t = token();
    return t ? { "Authorization": "Bearer " + t } : {};
  }
  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({}, authHeaders(), options.headers || {});
    if (options.body && typeof options.body !== "string") {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    return fetch(path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        return { ok: response.ok, status: response.status, data: data };
      });
    });
  }
  function message(data, fallback) {
    return (data && data.error) ? data.error : fallback;
  }

  /* --------------------------------------------------- the scroll source
     One source feeds every scrubbed property on the site. Effects register
     a range and are driven from here. */
  var scrollEffects = [];
  var scrollValue = 0;
  var scrollRaf = 0;
  var smoothers = [];

  function currentTarget() {
    return document.scrollingElement || document.documentElement;
  }
  function driveEffects() {
    scrollRaf = 0;
    var top = currentTarget().scrollTop;
    for (var i = 0; i < scrollEffects.length; i++) { scrollEffects[i](top); }
  }
  function onScroll() {
    scrollValue = currentTarget().scrollTop;
    document.documentElement.classList.add("is-scrolling");
    if (!scrollRaf) { scrollRaf = window.requestAnimationFrame(driveEffects); }
  }
  function bindScroll() {
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  window.addEventListener("load", function () {
    if (REDUCED) { return; }
    bindScroll();
    smoothWheel();
  });

  /* Keyboard, anchor and find-in-page scrolling keep native behaviour. */
  function smoothWheel() {
    if (REDUCED || COARSE) { return; }
    var target = currentTarget();
    var eased = 0;
    var running = false;
    var last = 0;
    function frame(now) {
      var delta = eased - target.scrollTop;
      if (Math.abs(delta) < 0.5) {
        running = false;
        document.documentElement.classList.remove("is-scrolling");
        return;
      }
      target.scrollTop = target.scrollTop + delta * 0.16;
      last = now;
      window.requestAnimationFrame(frame);
    }
    window.addEventListener("wheel", function (event) {
      if (event.ctrlKey || event.defaultPrevented) { return; }
      if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { return; }
      var node = event.target;
      while (node && node !== document.body) {
        if (node.dataset && node.dataset.nativeScroll) { return; }
        node = node.parentElement;
      }
      eased = target.scrollTop + event.deltaY;
      eased = Math.max(0, Math.min(eased, target.scrollHeight - target.clientHeight));
      if (!running) { running = true; window.requestAnimationFrame(frame); }
      event.preventDefault();
    }, { passive: false });
  }

  /* --------------------------------------------------- letter splitting
     The split is invisible to assistive technology and to selection. */
  function splitLetters(el) {
    var text = el.textContent;
    el.setAttribute("aria-label", text.trim());
    el.textContent = "";
    for (var i = 0; i < text.length; i++) {
      var span = document.createElement("span");
      span.className = "split-letter";
      span.setAttribute("aria-hidden", "true");
      span.textContent = text[i] === " " ? "\u00a0" : text[i];
      span.style.display = "inline-block";
      span.style.transition = "transform 0.45s cubic-bezier(.83,.12,.35,.96)";
      span.style.transitionDelay = (i * 24) + "ms";
      span.style.transform = "translateY(0)";
      el.appendChild(span);
    }
    return Array.prototype.slice.call(el.children);
  }
  function lettersEnter(el) {
    var spans = splitLetters(el);
    spans.forEach(function (span, i) {
      span.style.transform = "translateY(100%)";
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { span.style.transform = "translateY(0)"; });
      });
    });
  }
  document.addEventListener("alpine:init", function () {
    document.querySelectorAll("[data-split]").forEach(function (el) { lettersEnter(el); });
  });

  /* --------------------------------------------------- media layer
     Degrades to plain images when the rendering layer is unavailable. */
  function decorateMedia(root) {
    (root || document).querySelectorAll("[data-src]").forEach(function (holder) {
      if (holder.dataset.decorated) { return; }
      holder.dataset.decorated = "1";
      var src = holder.dataset.src;
      var img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.onload = function () { holder.classList.add("is-loaded"); };
      img.onerror = function () { holder.classList.add("is-failed"); };
      img.src = src;
      holder.appendChild(img);
      /* every media container uncovers from its bottom edge upward */
      var revealRoot = holder.closest("[data-reveal]");
      if (!revealRoot) {
        revealRoot = holder.parentElement;
        revealRoot.setAttribute("data-reveal", "");
      }
      observe(function () { revealRoot.classList.add("is-revealed"); }, revealRoot);
    });
    (root || document).querySelectorAll("[data-reel]").forEach(function (holder) {
      if (holder.dataset.decorated) { return; }
      holder.dataset.decorated = "1";
      attachReel(holder);
    });
  }

  function observe(callback, node, threshold) {
    if (!("IntersectionObserver" in window)) { callback(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { callback(); }
      });
    }, { rootMargin: "0px 0px 100% 0px", threshold: threshold || 0 });
    io.observe(node || document.body);
  }

  /* A reel is a generated field, drawn only while in view, never two at once. */
  var reels = [];
  var runningReels = 0;
  var canvasOk = (function () {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext && c.getContext("2d"));
    } catch (e) { return false; }
  })();

  function attachReel(holder) {
    var src = holder.dataset.reel;
    var seed = holder.dataset.seed || "0";
    var img = document.createElement("img");
    img.alt = holder.getAttribute("aria-label") || "";
    img.decoding = "async";
    img.src = src;
    holder.appendChild(img);
    if (!canvasOk || REDUCED || COARSE) { return; }

    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    var reel = { holder: holder, img: img, canvas: canvas, ctx: ctx, seed: seed,
                 playing: false, raf: 0, start: 0 };
    reels.push(reel);

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { wantPlay(reel); } else { stop(reel); }
      });
    }, { rootMargin: "0px 0px 100% 0px" });
    io.observe(holder);
  }

  function wantPlay(reel) {
    if (reel.playing) { return; }
    if (runningReels >= 2) { queue.push(reel); return; }
    play(reel);
  }
  var queue = [];
  function play(reel) {
    if (!reel.img.complete || !reel.img.naturalWidth) {
      reel.img.addEventListener("load", function () { wantPlay(reel); }, { once: true });
      return;
    }
    reel.playing = true;
    runningReels++;
    reel.canvas.width = Math.min(1280, reel.img.naturalWidth || 1280);
    reel.canvas.height = Math.round(reel.canvas.width * 0.5625);
    reel.canvas.style.width = "100%";
    reel.canvas.style.height = "100%";
    reel.holder.appendChild(reel.canvas);
    reel.start = performance.now();
    reel.raf = window.requestAnimationFrame(function (now) { draw(reel, now); });
  }
  function stop(reel) {
    if (!reel.playing) { return; }
    reel.playing = false;
    runningReels--;
    window.cancelAnimationFrame(reel.raf);
    if (reel.canvas.parentElement) { reel.canvas.parentElement.removeChild(reel.canvas); }
    var next = queue.shift();
    if (next) { wantPlay(next); }
  }
  function draw(reel, now) {
    if (!reel.playing) { return; }
    var t = ((now - reel.start) / 1000) % 12;
    var phase = t / 12;
    var ctx = reel.ctx;
    var w = reel.canvas.width, h = reel.canvas.height;
    ctx.clearRect(0, 0, w, h);
    var shift = Math.sin(phase * Math.PI * 2) * (w * 0.01);
    var brightness = 1 + 0.04 * Math.sin(phase * Math.PI * 2 * 3);
    ctx.filter = "brightness(" + brightness.toFixed(3) + ")";
    ctx.drawImage(reel.img, -Math.abs(shift), 0, w * 1.02, h);
    ctx.filter = "none";
    reel.raf = window.requestAnimationFrame(function (n) { draw(reel, n); });
  }

  window.addEventListener("load", function () { decorateMedia(document); });

  /* --------------------------------------------------- Alpine components */

  document.addEventListener("alpine:init", function () {

    Alpine.data("site", function () {
      return {
        route: document.body.dataset.route,
        cursorLabel: "",
        cursorLive: false,
        counterActive: false,
        counterValue: 0,
        counterNote: "",
        init: function () {
          var self = this;
          this.route = document.body.dataset.route || "page";
          if (COARSE) { document.body.classList.add("is-coarse"); }
          if (this.route === "entry") { this.runEntryCounter(); }
          this.bindCursor();
          this.bindContact();
          this.bindMarks();
          this.bindNav();
          this.bindFooter();
          this.bindBlur();
          this.bindRetraction();
          window.addEventListener("cirrus:page", function () { self.afterNavigate(); });
        },
        afterNavigate: function () {
          this.route = document.body.dataset.route || "page";
          decorateMedia(document);
          this.bindBlur();
        },
        runEntryCounter: function () {
          var self = this;
          this.counterActive = true;
          this.counterNote = "";
          var fonts = document.fonts ? document.fonts.ready : Promise.resolve();
          var total = 4 + document.querySelectorAll(".cluster__media").length;
          var done = 0;
          function bump() {
            done++;
            self.counterValue = Math.min(99, Math.round((done / total) * 100));
          }
          document.querySelectorAll(".cluster__media").forEach(function (node) {
            var img = node.querySelector("img");
            if (img && img.complete) { bump(); }
            else if (img) { img.addEventListener("load", bump, { once: true });
                            img.addEventListener("error", bump, { once: true }); }
            else { bump(); }
          });
          fonts.then(function () { bump(); bump(); });
          window.addEventListener("load", function () { bump(); bump(); });
          Promise.all([fonts, new Promise(function (r) {
            if (document.readyState === "complete") { r(); }
            else { window.addEventListener("load", r, { once: true }); }
          })]).then(function () {
            self.counterValue = 100;
            var veil = document.querySelector(".veil");
            window.setTimeout(function () {
              if (veil) { veil.classList.add("is-clear"); }
              self.counterActive = false;
            }, REDUCED ? 0 : 450);
          });
        },
        bindCursor: function () {
          if (COARSE) { return; }
          var self = this;
          var cursor = this.$refs.cursor;
          if (!cursor) { return; }
          var x = -999, y = -999, tx = -999, ty = -999, seen = false, last = 0;
          document.addEventListener("pointermove", function (event) {
            tx = event.clientX; ty = event.clientY;
            if (!seen) { x = tx; y = ty; seen = true; self.cursorLive = true; }
            var label = event.target.closest && event.target.closest("[data-cursor]");
            self.cursorLabel = label ? label.getAttribute("data-cursor") : "";
            var up = event.target.closest && event.target.closest("[data-cursor-up]");
            cursor.classList.toggle("is-up", !!up);
          });
          (function loop(now) {
            var coefficient = REDUCED ? 1 : Math.min(1, 0.08 * ((now - last) / 16.67));
            last = now;
            x += (tx - x) * coefficient;
            y += (ty - y) * coefficient;
            cursor.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)";
            window.requestAnimationFrame(loop);
          })(performance.now());
        },
        bindContact: function () {
          var self = this;
          document.querySelectorAll("[data-contact-link]").forEach(function (link) {
            link.addEventListener("click", function (event) {
              if (window.matchMedia("(max-width: 767px), (max-height: 499px)").matches) {
                event.preventDefault();
                window.dispatchEvent(new CustomEvent("cirrus:contact"));
              }
            });
          });
        },
        bindMarks: function () {
          var self = this;
          this.$nextTick(function () { self.opticalCentre(); });
          window.addEventListener("resize", function () { self.opticalCentre(); });
        },
        opticalCentre: function () {
          var mark = document.querySelector(".mark__svg:not([style*='display: none'])");
          var marks = document.querySelectorAll(".mark");
          marks.forEach(function (node) {
            var shown = node.querySelector(".mark__svg");
            node.style.setProperty("--cx", "0px");
          });
        },
        bindNav: function () {
          document.querySelectorAll(".topnav a, .wordmark").forEach(function (link) {
            link.addEventListener("click", function (event) {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) { return; }
              var href = link.getAttribute("href");
              if (!href || href.indexOf("mailto:") === 0 || href.indexOf("http") === 0) { return; }
              event.preventDefault();
              document.body.classList.add("is-transitioning");
              window.setTimeout(function () { window.location.href = href; }, 240);
            });
          });
        },
        bindFooter: function () {
          var footer = this.$refs.footer;
          if (!footer) { return; }
          var list = footer.querySelector(".footer__list");
          var start = 249.506;
          list.style.transform = "translateY(" + start + "px)";
          footer.style.opacity = "0";
          scrollEffects.push(function (top) {
            var doc = currentTarget();
            var max = doc.scrollHeight - window.innerHeight;
            if (max <= 0) { return; }
            var p = Math.max(0, Math.min(1, (top - (max * 0.55)) / (max * 0.45)));
            footer.style.opacity = String(p);
            list.style.transform = "translateY(" + (start * (1 - p)) + "px)";
          });
          if (REDUCED) { footer.style.opacity = "1"; list.style.transform = "none"; }
        },
        bindBlur: function () {
          var self = this;
          var blocks = document.querySelectorAll("[data-blur]");
          if (!blocks.length) { return; }
          if (REDUCED || window.matchMedia("(max-width: 767px), (max-height: 499px)").matches) {
            blocks.forEach(function (b) { b.classList.add("is-sharp"); });
            return;
          }
          scrollEffects.push(function (top) {
            var middle = window.innerHeight / 2;
            blocks.forEach(function (block) {
              var box = block.getBoundingClientRect();
              var centre = box.top + top + box.height / 2;
              var distance = Math.abs(centre - (top + middle));
              var p = Math.max(0, Math.min(1, 1 - (distance / window.innerHeight)));
              block.style.filter = "blur(" + (10 * (1 - p)).toFixed(2) + "px)";
            });
          });
        },
        bindRetraction: function () {
          if (!window.matchMedia("(max-width: 767px), (max-height: 499px)").matches) { return; }
          var frame = this.$refs.frame;
          if (!frame) { return; }
          scrollEffects.push(function (top) {
            frame.classList.toggle("is-retracted", top > 40);
          });
        }
      };
    });

    Alpine.data("entryCluster", function () {
      return {};
    });

    /* the contact overlay: parked below its resting place, rising as a stagger */
    Alpine.data("contactOverlay", function () {
      return {
        isOpen: false,
        house: (document.querySelector('meta[name="cirrus-contact"]') || {}).content || "prod@example.com",
        opener: null,
        init: function () {
          var self = this;
          window.addEventListener("cirrus:contact", function () { self.show(); });
        },
        show: function () {
          this.opener = document.activeElement;
          this.isOpen = true;
          this.$nextTick(function () {
            var overlay = document.querySelector(".overlay");
            if (overlay) { overlay.classList.add("is-open"); }
            var close = document.querySelector(".overlay__close");
            if (close) { close.focus(); }
          });
        },
        close: function () {
          this.isOpen = false;
          var overlay = document.querySelector(".overlay");
          if (overlay) { overlay.classList.remove("is-open"); }
          if (this.opener && this.opener.focus) { this.opener.focus(); }
        }
      };
    });

    Alpine.data("roster", function (talents) {
      var disciplines = [];
      talents.forEach(function (talent) {
        if (disciplines.indexOf(talent.discipline) === -1) { disciplines.push(talent.discipline); }
      });
      return {
        talents: talents,
        disciplines: disciplines,
        active: disciplines[0] || "",
        index: 0,
        narrow: false,
        init: function () {
          var self = this;
          if (this.talents.length) {
            var first = this.talents.filter(function (t) { return t.discipline === disciplines[0]; })[0];
            this.index = this.talents.indexOf(first);
          }
          /* below the breakpoint the whole set is in the document and the
             roster is a scroll; above it one talent fills the window */
          var query = window.matchMedia("(max-width: 767px), (max-height: 499px)");
          var apply = function () { self.narrow = query.matches; };
          query.addEventListener ? query.addEventListener("change", apply) : (query.onchange = apply);
          apply();
        },
        wide: function () { return this.narrow; },
        get filtered() {
          var active = this.active;
          return this.talents.filter(function (t) { return t.discipline === active; });
        },
        get current() {
          return this.filtered[this.index] || { slug: "", title: "", discipline: "" };
        },
        setActive: function (discipline) {
          this.active = discipline;
          this.index = 0;
          this.announce();
        },
        next: function () { this.step(1); },
        prev: function () { this.step(-1); },
        step: function (delta) {
          var total = this.filtered.length;
          if (!total) { return; }
          this.index = (this.index + delta + total) % total;
          this.announce();
        },
        announce: function () {
          var live = this.$el.querySelector("[aria-live]");
          if (!live) { return; }
          live.setAttribute("data-announce", this.current.title + ", " + this.current.discipline);
        }
      };
    });

    Alpine.data("studioLogin", function () {
      return {
        email: "", password: "", error: "", busy: false,
        init: function () {
          /* the door stays shut; only a signed-in producer is moved on */
        },
        submit: function () {
          var self = this;
          this.busy = true; this.error = "";
          api("/api/auth/login", { method: "POST", body: { email: this.email, password: this.password } })
            .then(function (response) {
              if (!response.ok) {
                self.busy = false;
                self.error = message(response.data, "That email and password do not match.");
                return;
              }
              setToken(response.data.token);
              window.location.replace("/studio");
            })
            .catch(function () { self.busy = false; self.error = "The studio did not answer. Try once more."; });
        }
      };
    });

    Alpine.data("signupForm", function () {
      return {
        email: "", password: "", error: "", busy: false,
        init: function () {},
        submit: function () {
          var self = this;
          this.busy = true; this.error = "";
          api("/api/auth/signup", { method: "POST", body: { email: this.email, password: this.password } })
            .then(function (response) {
              self.busy = false;
              if (!response.ok) {
                self.error = message(response.data, "That could not be signed up.");
                return;
              }
              setToken(response.data.token);
              window.location.href = "/";
            })
            .catch(function () { self.busy = false; self.error = "The studio did not answer. Try once more."; });
        }
      };
    });

    function signOut() {
      setToken("");
      fetch("/api/auth/signout", { method: "POST" }).catch(function () {})
        .finally(function () { window.location.replace("/studio/login"); });
    }

    Alpine.data("studioPalette", function (items) {
      return {
        items: items, query: "", cursor: 0,
        init: function () {
          var self = this;
          this.$watch("results", function () { self.cursor = 0; });
          this.$nextTick(function () {
            if (self.$refs.query) { self.$refs.query.focus(); }
          });
        },
        get actions() {
          return [
            { key: "a-talent", kind: "action", kindLabel: "ACTION", title: "New talent", meta: "/studio/talents/new", href: "/studio/talents/new" },
            { key: "a-work", kind: "action", kindLabel: "ACTION", title: "New work", meta: "/studio/works/new", href: "/studio/works/new" },
            { key: "a-order", kind: "action", kindLabel: "ACTION", title: "Reorder index", meta: "the twelve works", href: "/studio#order" }
          ];
        },
        get results() {
          var query = this.query.trim().toLowerCase();
          var out = [];
          this.actions.forEach(function (action) {
            if (!query || action.title.toLowerCase().indexOf(query) !== -1) { out.push(action); }
          });
          this.items.forEach(function (item) {
            var haystack = (item.title + " " + item.slug).toLowerCase();
            if (!query || haystack.indexOf(query) !== -1) {
              out.push({
                key: item.id, kind: item.kind, kindLabel: item.kind.toUpperCase(),
                title: item.title,
                meta: (item.published ? "LIVE " : "UNLISTED ") + item.slug,
                href: "/studio/items/" + item.id
              });
            }
          });
          return out;
        },
        move: function (delta) {
          var total = this.results.length;
          if (!total) { return; }
          this.cursor = (this.cursor + delta + total) % total;
        },
        choose: function (index) {
          var option = this.results[index === undefined ? this.cursor : index];
          if (option) { window.location.href = option.href; }
        },
        signout: signOut
      };
    });

    Alpine.data("studioNew", function (kind) {
      return {
        kind: kind, title: "", slug: "", discipline: "director", variant: "left",
        error: "", busy: false,
        init: function () {
          if (!token()) { window.location.href = "/studio/login"; }
        },
        submit: function () {
          var self = this;
          this.busy = true; this.error = "";
          var body = { kind: this.kind, title: this.title };
          if (this.slug) { body.slug = this.slug; }
          if (this.kind === "talent") { body.discipline = this.discipline; }
          else { body.variant = this.variant; }
          api("/api/studio/items", { method: "POST", body: body })
            .then(function (response) {
              self.busy = false;
              if (!response.ok) {
                self.error = message(response.data, "That record could not be made.");
                return;
              }
              window.location.href = "/studio/items/" + response.data.id;
            })
            .catch(function () { self.busy = false; self.error = "The studio did not answer. Try once more."; });
        },
        signout: signOut
      };
    });

    Alpine.data("studioItem", function (item) {
      return {
        item: item, title: item.title, published: !!item.published,
        draft: {
          title: item.title, slug: item.slug,
          discipline: item.discipline || "director", variant: item.variant || "left"
        },
        media: item.media || [], credits: item.credits || [],
        mediaDraft: { role: "poster", width: 598, height: 320, alt: "" },
        creditDraft: { role: "", name: "", talent_id: "" },
        previewUrl: "", previewLabel: "", error: "", ok: "",
        mediaError: "", creditError: "", busy: false,
        init: function () {
          if (!token()) { window.location.href = "/studio/login"; }
        },
        get stateNote() {
          return this.item.published_at ? "PUBLISHED " + this.item.published_at.slice(0, 16).replace("T", " ") : "PUBLISHED_AT NULL";
        },
        save: function () {
          var self = this;
          this.busy = true; this.error = ""; this.ok = "";
          var body = { title: this.draft.title };
          if (this.item.kind === "talent") { body.discipline = this.draft.discipline; }
          else { body.variant = this.draft.variant; }
          api("/api/studio/items/" + this.item.id, { method: "PATCH", body: body })
            .then(function (response) {
              self.busy = false;
              if (!response.ok) {
                self.error = message(response.data, "That change was refused.");
                return;
              }
              self.title = response.data.title;
              self.item = response.data;
              self.ok = "Saved. The record is unchanged in public until you publish it.";
            })
            .catch(function () { self.busy = false; self.error = "The studio did not answer."; });
        },
        rename: function () {
          var self = this;
          this.busy = true; this.error = ""; this.ok = "";
          api("/api/studio/items/" + this.item.id + "/slug", { method: "POST", body: { slug: this.draft.slug } })
            .then(function (response) {
              self.busy = false;
              if (!response.ok) {
                self.error = message(response.data, "That slug could not be taken.");
                return;
              }
              self.item = response.data;
              self.draft.slug = response.data.slug;
              self.ok = "Renamed. The old address redirects for good.";
            })
            .catch(function () { self.busy = false; self.error = "The studio did not answer."; });
        },
        addMedia: function () {
          var self = this;
          this.busy = true; this.mediaError = "";
          api("/api/studio/items/" + this.item.id + "/media", { method: "POST", body: this.mediaDraft })
            .then(function (response) {
              self.busy = false;
              if (!response.ok) {
                self.mediaError = message(response.data, "That still could not be attached.");
                return;
              }
              return api("/api/studio/items/" + self.item.id).then(function (fresh) {
                if (fresh.ok) { self.media = fresh.data.media; }
                self.mediaDraft.alt = "";
                self.ok = "Attached.";
              });
            })
            .catch(function () { self.busy = false; self.mediaError = "The studio did not answer."; });
        },
        addCredit: function () {
          var self = this;
          this.busy = true; this.creditError = "";
          var body = { role: this.creditDraft.role, name: this.creditDraft.name };
          if (this.creditDraft.talent_id) { body.talent_id = this.creditDraft.talent_id; }
          api("/api/studio/items/" + this.item.id + "/credits", { method: "POST", body: body })
            .then(function (response) {
              self.busy = false;
              if (!response.ok) {
                self.creditError = message(response.data, "That credit could not be added.");
                return;
              }
              self.credits.push(response.data);
              self.creditDraft = { role: "", name: "", talent_id: "" };
            })
            .catch(function () { self.busy = false; self.creditError = "The studio did not answer."; });
        },
        mintPreview: function () {
          var self = this;
          this.busy = true; this.error = "";
          api("/api/studio/preview-tokens", { method: "POST", body: { item_id: this.item.id } })
            .then(function (response) {
              self.busy = false;
              if (!response.ok) {
                self.error = message(response.data, "A preview could not be minted.");
                return;
              }
              self.previewUrl = "/preview/" + response.data.token;
              self.previewLabel = "OPEN THE PREVIEW, GOOD FOR 15 MINUTES";
            })
            .catch(function () { self.busy = false; self.error = "The studio did not answer."; });
        },
        publish: function (published) {
          var self = this;
          this.busy = true; this.error = "";
          api("/api/studio/items/" + this.item.id + "/publish", { method: "POST", body: { published: published } })
            .then(function (response) {
              self.busy = false;
              if (!response.ok) {
                self.error = message(response.data, "That was refused.");
                return;
              }
              if (published) { window.location.href = "/studio/items/" + self.item.id + "/published"; }
              else { self.published = false; self.item = response.data; }
            })
            .catch(function () { self.busy = false; self.error = "The studio did not answer."; });
        },
        signout: signOut
      };
    });
  });
})();
