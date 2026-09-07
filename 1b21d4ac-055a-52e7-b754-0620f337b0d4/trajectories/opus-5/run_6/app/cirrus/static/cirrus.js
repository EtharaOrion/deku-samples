/* The rendered document's behaviour and nothing else.
   One scroll source feeds every scrubbed property; the cursor pair, the reveals, the
   route transition, the reel layer and the analytics page-view all hang off it. */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;
  var narrow = function () {
    return window.matchMedia('(max-width: 768px), (max-height: 500px)').matches;
  };

  /* ------------------------------------------------------------ one scroll source */

  var Scroll = {
    target: 0,
    current: 0,
    effects: [],
    flagTimer: null,
    running: false,

    /* The route tree swaps beneath the frame, so its effects are released with it. */
    clear: function () { this.effects = []; },

    init: function () {
      var self = this;
      this.current = this.target = window.scrollY;
      window.addEventListener('scroll', function () {
        self.target = window.scrollY;
        if (reduced) self.current = self.target;
        self.flag();
        self.request();
      }, { passive: true });
      // A scroll that ends between frames still leaves every effect at its final value.
      window.addEventListener('scrollend', function () { self.run(); });
      window.addEventListener('resize', function () { self.measure(); self.request(); });
      this.measure();
      this.request();
    },
    register: function (fn) { this.effects.push(fn); this.request(); },
    run: function () {
      var y = this.current;
      this.effects.forEach(function (fn) { fn(y); });
    },
    measure: function () {
      this.effects.forEach(function (fn) { if (fn.measure) fn.measure(); });
    },
    flag: function () {
      var self = this;
      document.documentElement.classList.add('is-scrolling');
      clearTimeout(this.flagTimer);
      this.flagTimer = setTimeout(function () {
        document.documentElement.classList.remove('is-scrolling');
      }, 140);
    },
    request: function () {
      if (this.running) return;
      this.running = true;
      var self = this;
      requestAnimationFrame(function step(now) {
        // Smoothed for the effect system; native scroll is never hijacked, so keyboard
        // scrolling, anchors and find-in-page keep working.
        if (reduced) self.current = self.target;
        else self.current += (self.target - self.current) * 0.16;
        var delta = Math.abs(self.target - self.current);
        if (delta < 0.4) self.current = self.target;
        self.effects.forEach(function (fn) { fn(self.current); });
        if (delta >= 0.4) requestAnimationFrame(step);
        else self.running = false;
      });
    }
  };

  /* ------------------------------------------------------------ the cursor pair */

  function cursorPair() {
    if (coarse || reduced) return;
    var pair = document.getElementById('cursor-pair');
    if (!pair) return;
    var label = pair.querySelector('.cursor-label');
    var px = -999, py = -999, cx = -999, cy = -999;
    var active = false;
    var last = performance.now();
    var running = false;
    var written = '';

    function start() {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }

    document.addEventListener('pointermove', function (event) {
      px = event.clientX; py = event.clientY;
      if (!active) {
        active = true;
        cx = px; cy = py;
        pair.style.transition = 'opacity 300ms ease';
        pair.style.opacity = '1';
      }
      start();
      var target = event.target.closest('[data-cursor-label]');
      label.textContent = target ? target.getAttribute('data-cursor-label') : '';
      pair.classList.toggle('is-hidden-square',
        !!event.target.closest('.no-cursor'));
      pair.classList.toggle('is-above',
        !!(target && target.hasAttribute('data-cursor-above')));
    }, { passive: true });

    function frame(now) {
      var dt = Math.min(64, now - last); last = now;
      // Frame-rate independent lag: about 0.08 per frame at 60fps, normalised, so the
      // marker arrives a moment after the pointer rather than being locked to it.
      var k = 1 - Math.pow(1 - 0.08, dt / (1000 / 60));
      cx += (px - cx) * k; cy += (py - cy) * k;
      var next = 'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
      if (next !== written) { written = next; pair.style.transform = next; }
      // The loop idles once the marker has caught up, rather than running forever.
      if (Math.abs(px - cx) > 0.1 || Math.abs(py - cy) > 0.1) requestAnimationFrame(frame);
      else running = false;
    }
  }

  /* ------------------------------------------------------------ the reveal wipe */

  /* The wipe: a container rests fully clipped away and is uncovered from its bottom edge
     upward, with the -123px lateral slide running together with it. Driven from the one
     scroll source rather than a listener of its own. */
  function reveals() {
    var tiles = Array.prototype.slice.call(document.querySelectorAll('.tile-reveal'));
    if (!tiles.length) return;
    if (reduced) {
      // Reduced motion resolves every scrubbed effect to its end state.
      tiles.forEach(function (t) { t.classList.add('is-revealed'); });
      return;
    }
    var pending = tiles.slice();
    var effect = function () {
      if (!pending.length) return;
      var limit = window.innerHeight * 0.88;
      pending = pending.filter(function (el) {
        var box = el.getBoundingClientRect();
        if (box.top > limit || box.bottom < 0) return true;
        el.style.willChange = 'clip-path, transform'; // hinted only while animating
        el.classList.add('is-revealed');
        setTimeout(function () { el.style.willChange = 'auto'; }, 900);
        return false;
      });
    };
    Scroll.register(effect);
    effect();
    // The first screenful reveals on arrival rather than waiting for a scroll.
    requestAnimationFrame(effect);
  }

  /* ------------------------------------------------------------ the about blur */

  function blurBlocks() {
    var blocks = Array.prototype.slice.call(document.querySelectorAll('[data-blur]'));
    if (!blocks.length) return;
    if (reduced || narrow()) {
      // Resolves to its end state: the reader gets the sharp text.
      blocks.forEach(function (b) { b.style.filter = 'blur(0px)'; });
      return;
    }
    var effect = function () {
      var mid = window.innerHeight / 2;
      blocks.forEach(function (block) {
        var box = block.getBoundingClientRect();
        var centre = box.top + box.height / 2;
        // Full blur a screen away, zero when the centre reaches the window's centre;
        // continuous and reversible, so scrolling back re-blurs.
        var distance = Math.abs(centre - mid) / window.innerHeight;
        var radius = Math.max(0, Math.min(1, distance)) * 10;
        var next = radius < 0.02 ? 'none' : 'blur(' + radius.toFixed(2) + 'px)';
        // Written only when it changes, so a settled page stops restyling and the
        // compositor hint comes off with it.
        if (block.__blur === next) return;
        block.__blur = next;
        block.style.filter = next === 'none' ? '' : next;
        block.style.willChange = next === 'none' ? 'auto' : 'filter';
      });
    };
    Scroll.register(effect);
    effect();
  }

  /* ------------------------------------------------------------ the footer arrival */

  function footerArrival() {
    var footer = document.getElementById('site-footer');
    if (!footer) return;
    if (reduced) { footer.classList.add('is-arrived'); return; }
    var effect = function () {
      var limit = document.documentElement.scrollHeight - window.innerHeight;
      var progress = limit > 0 ? window.scrollY / limit : 1;
      footer.classList.toggle('is-arrived', progress > 0.66 || limit <= 0);
    };
    Scroll.register(effect);
    effect();
  }

  /* ------------------------------------------------------------ the frame retraction */

  function frameRetraction() {
    if (!narrow()) return;
    var lastY = window.scrollY;
    Scroll.register(function () {
      var y = window.scrollY;
      // A threshold, not a continuous scrub.
      if (y > lastY + 40 && y > 160) document.body.classList.add('is-retracted');
      else if (y < lastY - 40) document.body.classList.remove('is-retracted');
      lastY = y;
    });
  }

  /* ------------------------------------------------------------ the route transition */

  /* The persistent tree is not a child of the route outlet: the frame, the cursor pair,
     the footer, the counter well and the contact overlay mount once and survive every
     navigation. Only the well's contents are fetched and swapped. */
  function routeTransition() {
    var busy = false;

    function swap(href, push) {
      if (busy) return;
      busy = true;
      var body = document.body;
      // One shared 0.4s fade across the frame, the counter well, the footer and the
      // outgoing content; the cursor pair at depth 50 is above the veil and stays put.
      if (!reduced) body.classList.add('is-transitioning');
      var wait = reduced ? 0 : 400;
      var fetched = fetch(href, { credentials: 'same-origin', headers: { 'X-Route-Swap': '1' } })
        .then(function (r) {
          if (!r.ok && r.status !== 404) throw new Error('route');
          return r.text().then(function (html) { return { html: html, url: r.url }; });
        });

      Promise.all([fetched, new Promise(function (r) { setTimeout(r, wait); })])
        .then(function (results) {
          var payload = results[0];
          var doc = new DOMParser().parseFromString(payload.html, 'text/html');
          var incoming = doc.getElementById('content');
          var well = document.getElementById('content');
          if (!incoming || !well) throw new Error('no well');

          Scroll.clear();
          well.innerHTML = incoming.innerHTML;
          well.className = incoming.className;
          document.title = doc.title;
          var route = doc.documentElement.dataset.route || 'home';
          document.documentElement.dataset.route = route;
          body.className = doc.body.className;
          if (!reduced) body.classList.add('is-transitioning');
          if (push) history.pushState({}, '', payload.url);
          window.scrollTo(0, 0);

          // The centre mark swaps to the new route's variant while the frame is faded out.
          var shell = window.CIRRUS && window.CIRRUS.shell;
          if (shell) {
            shell.route = route;
            shell.markFor = ['works', 'talents', 'about'].indexOf(route) !== -1
              ? route : 'home';
            shell.footerArrived = reduced;
            shell.contactOpen = false;
            shell.footerEnabled = ['home', 'talents', 'preview'].indexOf(route) === -1;
            shell.veilVisible = false;
            shell.counterVisible = false;
          }
          // Alpine enhances the delivered HTML in place, including the swapped route.
          if (window.Alpine && window.Alpine.initTree) window.Alpine.initTree(well);
          mountRoute();
          if (shell && route === 'home') {
            shell.veilVisible = true;
            shell.counterVisible = true;
            shell.counterText = '0%';
            shell.runCounter();
          }
          requestAnimationFrame(function () {
            body.classList.remove('is-transitioning');
            busy = false;
          });
        })
        .catch(function () {
          window.location.assign(href); // a swap that cannot complete is an ordinary load
        });
    }

    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[data-nav]');
      if (!link) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
        || event.button !== 0) return;
      var href = link.getAttribute('href');
      if (!href || href.charAt(0) !== '/' || href.slice(0, 2) === '//') return;
      if (link.target) return;
      event.preventDefault();
      if (href === window.location.pathname) return;
      swap(href, true);
    });

    window.addEventListener('popstate', function () {
      swap(window.location.pathname + window.location.search, false);
    });
  }

  /* ------------------------------------------------------------ the reel layer */

  function reelLayer() {
    var blocks = Array.prototype.slice.call(document.querySelectorAll('[data-reel]'));
    if (!blocks.length) return;
    var saveData = (navigator.connection && (navigator.connection.saveData
      || /2g/.test(navigator.connection.effectiveType || ''))) || false;
    if (reduced || saveData) return; // the still remains, never a blank frame

    var playing = [];

    function prepare(block) {
      if (block.dataset.prepared) return;
      var img = block.querySelector('.reel-still');
      if (!img || !img.complete || !img.naturalWidth) return;
      var canvas = block.querySelector('.reel-canvas');
      var ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return; // degrades to the plain composited still
      block.dataset.prepared = '1';
      var w = canvas.width = 480;
      var h = canvas.height = Math.max(1, Math.round(480 * img.naturalHeight
        / img.naturalWidth));
      var seedNum = 0;
      var url = block.getAttribute('data-seed-url') || '';
      for (var i = 0; i < url.length; i++) seedNum = (seedNum * 31 + url.charCodeAt(i)) % 997;
      var direction = seedNum % 2 ? 1 : -1;
      var start = performance.now();

      block.__stop = function () {
        block.classList.remove('is-playing');
        block.__frame = null;
      };
      block.__play = function () {
        block.classList.add('is-playing');
        block.__frame = function step(now) {
          if (!block.__frame) return;
          var t = (now - start) / 1000;
          var phase = ((t % 12) / 12) * h * 0.06 * direction;
          // A slower second cycle varies brightness so the loop point is not visible.
          var lum = 1 + Math.sin(t / 7) * 0.03;
          ctx.clearRect(0, 0, w, h);
          ctx.filter = 'brightness(' + lum.toFixed(3) + ')';
          ctx.drawImage(img, 0, phase - h * 0.03, w, h * 1.06);
          ctx.filter = 'none';
          requestAnimationFrame(step);
        };
        requestAnimationFrame(block.__frame);
      };
      block.__play();
    }

    if (!('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var block = entry.target;
        if (entry.isIntersecting) {
          if (playing.length >= 2) return; // never more than two run at once
          if (playing.indexOf(block) === -1) playing.push(block);
          prepare(block);
          if (block.__play && !block.classList.contains('is-playing')) block.__play();
        } else {
          if (block.__stop) block.__stop();
          playing = playing.filter(function (b) { return b !== block; });
        }
      });
    }, { rootMargin: '100% 0px' }); // nothing is prepared beyond one window height
    blocks.forEach(function (b) { observer.observe(b); });
  }

  /* ------------------------------------------------------------ the roster name fit */

  /* A name that will not fit the window at 125px reduces to fit rather than wrapping,
     because the label, the mark and the portrait are positioned from fixed offsets. */
  function fitRosterNames() {
    if (narrow()) return;
    var names = document.querySelectorAll('.roster-name, .talent-name');
    Array.prototype.forEach.call(names, function (name) {
      var limit = window.innerWidth - 108;
      var size = 125;
      name.style.fontSize = size + 'px';
      name.style.lineHeight = '137.5px';
      // The block fills the window, so the text's own width is measured, not the block's.
      var measure = function () {
        var range = document.createRange();
        range.selectNodeContents(name);
        return range.getBoundingClientRect().width;
      };
      while (measure() > limit && size > 40) {
        size -= 3;
        name.style.fontSize = size + 'px';
        name.style.lineHeight = (size * 1.1) + 'px';
      }
    });
  }

  /* ------------------------------------------------------------ analytics */

  function analytics() {
    // Waits until the route is interactive, counts page views and nothing else, and
    // fails quietly rather than putting an error screen where the work should be.
    var send = function () {
      try {
        var payload = { path: window.location.pathname };
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/analytics/view', JSON.stringify(payload));
        }
      } catch (err) { /* a loader that never arrives fails quietly */ }
    };
    if (document.readyState === 'complete') setTimeout(send, 0);
    else window.addEventListener('load', function () { setTimeout(send, 0); });
  }

  /* Mounted for each route the well carries; the frame above it never remounts. */
  function mountRoute() {
    reveals();
    blurBlocks();
    footerArrival();
    reelLayer();
    fitRosterNames();
    analytics();
  }
  window.cirrusMountRoute = mountRoute;

  function boot() {
    Scroll.init();
    cursorPair();          // mounted once, with the frame
    frameRetraction();     // mounted once, with the frame
    routeTransition();     // mounted once, with the frame
    mountRoute();
    window.addEventListener('resize', fitRosterNames);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
