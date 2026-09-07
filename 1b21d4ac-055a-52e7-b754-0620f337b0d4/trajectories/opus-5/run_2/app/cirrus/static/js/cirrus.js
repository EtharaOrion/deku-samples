/* The rendered document's behaviour and nothing else. It decides nothing about
   who may see a record: the server refuses the call regardless of what the
   page drew. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;

  /* ------------------------------------------------------- one scroll source */
  var scroll = {
    y: 0,
    target: 0,
    height: 0,
    listeners: [],
    inFlight: false
  };

  function registerScroll(fn) { scroll.listeners.push(fn); fn(scroll.y); }

  function measure() {
    scroll.height = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  function emit() {
    for (var i = 0; i < scroll.listeners.length; i++) scroll.listeners[i](scroll.y);
  }

  var flightTimer = null;
  function markInFlight() {
    if (!scroll.inFlight) {
      scroll.inFlight = true;
      document.documentElement.classList.add('scrolling');
    }
    clearTimeout(flightTimer);
    flightTimer = setTimeout(function () {
      scroll.inFlight = false;
      document.documentElement.classList.remove('scrolling');
    }, 140);
  }

  /* Keyboard scrolling, anchors and find-in-page keep working: the smoothing
     rides on top of native scroll rather than replacing it. */
  function onNativeScroll() {
    scroll.target = window.scrollY;
    if (reduced) {
      scroll.y = scroll.target;
      emit();
    }
    markInFlight();
  }

  function smoothLoop() {
    if (!reduced) {
      var d = scroll.target - scroll.y;
      if (Math.abs(d) > 0.05) {
        scroll.y += d * 0.16;
      } else {
        scroll.y = scroll.target;
      }
      emit();
    }
    requestAnimationFrame(smoothLoop);
  }

  window.addEventListener('scroll', onNativeScroll, { passive: true });
  window.addEventListener('resize', function () { measure(); emit(); });

  /* ------------------------------------------------------------ the counter */
  function optical(el) {
    /* A mark is centred on the window midpoint by its own rendered width, and
       the counter recomputes its correction as its string widens. */
    if (!el) return;
    var w = el.getBoundingClientRect().width;
    el.style.transform = 'translateX(' + (-w / 2).toFixed(4) + 'px)';
  }

  function runCounter() {
    var well = document.getElementById('counter-well');
    var value = document.getElementById('counter-value');
    var veil = document.getElementById('route-veil');
    if (!well || !value) return;
    if (well.dataset.role !== 'load') return;

    document.body.classList.add('loading');

    /* Real progress against a defined set: the fonts, the chrome and the
       cluster's own stills. Reels are not fetched at this point. */
    var stills = Array.prototype.slice.call(document.querySelectorAll('[data-load-tracked]'));
    var total = stills.length + 2;
    var done = 0;
    var shown = 0;

    function settle(img) {
      if (img.__counted) return;
      img.__counted = true;
      done++;
    }

    stills.forEach(function (img) {
      if (img.complete && img.naturalWidth) { settle(img); return; }
      img.addEventListener('load', function () { settle(img); }, { once: true });
      img.addEventListener('error', function () { settle(img); }, { once: true });
    });

    var fontsDone = false;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { fontsDone = true; });
    } else { fontsDone = true; }

    var chromeDone = false;
    if (document.readyState === 'complete') { chromeDone = true; }
    else { window.addEventListener('load', function () { chromeDone = true; }); }

    var finished = false;
    var started = performance.now();
    function tick() {
      var real = (done + (fontsDone ? 1 : 0) + (chromeDone ? 1 : 0)) / total;
      var pct = Math.floor(real * 100);
      /* The number never runs ahead of what is actually ready, and it counts
         rather than jumping: on a warm cache the ceiling below is what the
         reader sees climb, and it can never exceed real progress. */
      var ceiling = Math.floor((performance.now() - started) / 6);
      pct = Math.min(pct, ceiling);
      if (pct > shown) shown = Math.min(pct, 100);
      value.textContent = shown + '%';
      optical(value);
      if (shown >= 100 && !finished) {
        finished = true;
        setTimeout(function () {
          document.body.classList.remove('loading');
          if (veil) veil.classList.remove('covering');
          well.dataset.role = 'idle';
          document.body.dataset.loaded = 'true';
        }, 220);
        return;
      }
      requestAnimationFrame(tick);
    }
    value.textContent = '0%';
    optical(value);
    requestAnimationFrame(tick);

    /* A loader that never arrives fails quietly rather than putting an error
       screen where the work should be. */
    setTimeout(function () {
      fontsDone = true; chromeDone = true;
      stills.forEach(settle);
    }, 6000);
  }

  /* --------------------------------------------------------- the cursor pair */
  function runCursor() {
    var square = document.getElementById('cursor-square');
    var label = document.getElementById('cursor-label');
    if (!square || !label || coarse || reduced) return;

    var px = -999, py = -999, cx = -999, cy = -999;
    var active = false, above = false, last = performance.now();

    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      px = e.clientX; py = e.clientY;
      if (cx === -999) { cx = px; cy = py; }
      var target = e.target.closest ? e.target.closest('[data-cursor-label], [data-nocursor]') : null;
      var text = '';
      var suppress = false;
      above = false;
      if (target) {
        if (target.hasAttribute('data-nocursor')) suppress = true;
        text = target.getAttribute('data-cursor-label') || '';
        above = target.hasAttribute('data-cursor-above');
      }
      square.style.opacity = suppress ? '0' : '1';
      if (text) {
        label.textContent = text;
        label.classList.add('visible');
      } else {
        label.classList.remove('visible');
      }
      active = true;
    }, { passive: true });

    /* Frame-rate independent lag, so it arrives a moment after the pointer. */
    function follow(now) {
      var dt = Math.min(64, now - last); last = now;
      if (active) {
        var k = 1 - Math.pow(1 - 0.08, dt / (1000 / 60));
        cx += (px - cx) * k;
        cy += (py - cy) * k;
        square.style.transform = 'translate3d(' + (cx - 5) + 'px,' + (cy - 5) + 'px,0)';
        var ly = above ? cy - 150 : cy + 14;
        label.style.transform = 'translate3d(' + (cx + 16) + 'px,' + ly + 'px,0)';
      }
      requestAnimationFrame(follow);
    }
    requestAnimationFrame(follow);
  }

  /* ------------------------------------------- media placeholders and reveal */
  function runMedia() {
    /* A still inside a clipped container is not laid out as visible, and a
       lazy image in that state may never be fetched at all. Nothing here may
       depend on the clip: a still within one window height is asked for
       directly, so it is on screen before its reveal and before its reel. */
    var lazies = Array.prototype.slice.call(
      document.querySelectorAll('[data-still][loading="lazy"]'));
    function promote() {
      var vh = window.innerHeight;
      lazies = lazies.filter(function (img) {
        var host = img.closest('.tile, .cluster-still, .roster-portrait') || img;
        var r = host.getBoundingClientRect();
        if (r.top < vh * 2 && r.bottom > -vh) {
          if (!img.complete || !img.naturalWidth) {
            var src = img.getAttribute('src');
            img.setAttribute('loading', 'eager');
            /* re-assigning the address is what actually starts the fetch */
            if (src) { img.setAttribute('src', src); }
          }
          return false;
        }
        return true;
      });
    }
    promote();
    registerScroll(promote);

    document.querySelectorAll('[data-still]').forEach(function (img) {
      var holder = img.closest('.tile-frame, .cluster-frame, .roster-portrait');
      var ph = holder ? holder.querySelector('[data-placeholder]') : null;
      function clear() { if (ph) ph.classList.add('cleared'); }
      if (img.complete) { clear(); }
      else {
        img.addEventListener('load', clear, { once: true });
        /* clears on decode or on failure alike */
        img.addEventListener('error', clear, { once: true });
      }
    });

    var reveals = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    if (reduced) {
      reveals.forEach(function (el) { el.classList.add('revealed'); });
    } else if ('IntersectionObserver' in window) {
      /* The reveal element rests clipped to zero area, which an observer reads
         as never intersecting. Watch an unclipped stand-in instead and map the
         answer back to the element that carries the wipe. */
      var owner = new WeakMap();
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = owner.get(entry.target) || entry.target;
          el.classList.add('revealed');
          io.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(function (el) {
        /* the stand-in must sit outside the clip, so it is the parent */
        var watched = el.parentElement || el;
        owner.set(watched, el);
        io.observe(watched);
      });
    } else {
      reveals.forEach(function (el) { el.classList.add('revealed'); });
    }
  }

  /* --------------------------------------------------------------- the reels */
  function runReels() {
    var saveData = navigator.connection && (navigator.connection.saveData ||
      /2g/.test(navigator.connection.effectiveType || ''));
    if (reduced || saveData) return;

    var canvases = Array.prototype.slice.call(document.querySelectorAll('[data-reel]'));
    if (!canvases.length) return;

    var running = [];

    function stops(canvas) {
      /* The reel takes the still as its base field: same seed, same colours. */
      var img = canvas.parentElement.querySelector('[data-still]');
      return img;
    }

    function start(canvas) {
      if (canvas.__running || running.length >= 2) return;  /* never more than two */
      var img = stops(canvas);
      if (!img || !img.complete || !img.naturalWidth) return;
      canvas.__running = true;
      running.push(canvas);
      var ctx = canvas.getContext('2d');
      if (!ctx) { canvas.__running = false; return; }
      var rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(2, Math.round(rect.width));
      canvas.height = Math.max(2, Math.round(rect.height));
      var dir = (canvas.dataset.reelW | 0) % 2 ? 1 : -1;
      var t0 = performance.now();
      canvas.classList.add('playing');
      canvas.style.willChange = 'opacity';

      function frame(now) {
        if (!canvas.__running) return;
        var t = (now - t0) / 1000;
        var phase = (t % 12) / 12;                 /* a 12 second cycle */
        var bright = 1 + Math.sin(t / 8.7) * 0.03; /* a few percent, slower */
        var w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.filter = 'brightness(' + bright.toFixed(3) + ')';
        var dx = dir * phase * w * 0.08;
        ctx.drawImage(img, dx - w * 0.04, 0, w * 1.08, h);
        ctx.drawImage(img, dx - w * 0.04 + (dir > 0 ? -w * 1.08 : w * 1.08), 0, w * 1.08, h);
        ctx.restore();
        canvas.__raf = requestAnimationFrame(frame);
      }
      canvas.__raf = requestAnimationFrame(frame);
    }

    function stop(canvas) {
      if (!canvas.__running) return;
      canvas.__running = false;
      cancelAnimationFrame(canvas.__raf);
      canvas.classList.remove('playing');
      canvas.style.willChange = '';
      var ctx = canvas.getContext('2d');
      /* the still is never replaced by a blank frame: it sits underneath */
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      running = running.filter(function (c) { return c !== canvas; });
    }

    function sweep() {
      var vh = window.innerHeight;
      canvases.forEach(function (canvas) {
        var r = canvas.getBoundingClientRect();
        /* nothing is prepared until its still is within one window height */
        var near = r.top < vh * 2 && r.bottom > -vh;
        var inView = r.top < vh && r.bottom > 0;
        if (inView && near) start(canvas); else stop(canvas);
      });
    }
    registerScroll(sweep);
    setTimeout(sweep, 500);
  }

  /* ----------------------------------------------------------- the about blur */
  function runBlur() {
    var blocks = Array.prototype.slice.call(document.querySelectorAll('[data-blur]'));
    var once = Array.prototype.slice.call(document.querySelectorAll('[data-blur-once]'));
    var narrow = window.matchMedia('(max-width: 768px), (max-height: 500px)').matches;

    once.forEach(function (el) {
      if (reduced || narrow) { el.style.filter = 'none'; return; }
      el.style.filter = 'blur(10px)';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.style.filter = 'blur(0px)'; });
      });
    });

    if (!blocks.length) return;
    if (reduced || narrow) {
      blocks.forEach(function (el) { el.style.filter = 'none'; });
      return;
    }
    /* Continuous and reversible: scrolling back re-blurs. Full blur when the
       block is a screen away, zero when its centre reaches the window's. */
    registerScroll(function () {
      var vh = window.innerHeight;
      blocks.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var centre = r.top + r.height / 2;
        var d = Math.abs(centre - vh / 2) / vh;
        var radius = Math.max(0, Math.min(1, d)) * 10;
        el.style.filter = radius < 0.05 ? 'none' : 'blur(' + radius.toFixed(2) + 'px)';
      });
    });
  }

  /* -------------------------------------------------- footer arrival, retract */
  function runFooter() {
    var footer = document.getElementById('footer');
    if (!footer) return;
    var inner = document.getElementById('footer-inner');
    var scrim = footer.querySelector('.footer-scrim');
    if (reduced) {
      if (inner) inner.classList.add('arrived');
      if (scrim) scrim.classList.add('arrived');
      return;
    }
    registerScroll(function (y) {
      measure();
      var progress = scroll.height ? y / scroll.height : 1;
      var arrived = progress > 0.72;
      if (inner) inner.classList.toggle('arrived', arrived);
      if (scrim) scrim.classList.toggle('arrived', arrived);
    });
  }

  function runRetraction() {
    var narrow = window.matchMedia('(max-width: 768px), (max-height: 500px)');
    var lastY = 0;
    registerScroll(function (y) {
      if (!narrow.matches) { document.body.classList.remove('retracted'); return; }
      /* a threshold, not a continuous scrub */
      var down = y > lastY + 4;
      var up = y < lastY - 4;
      if (down && y > 160) document.body.classList.add('retracted');
      if (up) document.body.classList.remove('retracted');
      if (down || up) lastY = y;
    });
  }

  /* ------------------------------------------- the frame's observable persistence */
  /* The frame, the counter well, the footer and the outgoing content take one
     state class and fade together on the same 0.4s; the cursor pair at depth
     50 sits above the veil and does not participate. */
  function runTransitions() {
    if (reduced) return;
    document.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('a[href]') : null;
      if (!link) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;
      var href = link.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(mailto|tel|https?):/.test(href)) {
        if (!href.startsWith(location.origin)) return;
      }
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      var url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      e.preventDefault();
      fade(url.href);
    });

    window.addEventListener('pageshow', function () { unfade(); });
  }

  function fadingElements() {
    return [document.getElementById('frame'), document.getElementById('well'),
            document.getElementById('counter-well'), document.getElementById('footer')]
      .filter(Boolean);
  }

  function fade(href) {
    fadingElements().forEach(function (el) { el.classList.add('fading'); });
    setTimeout(function () { location.href = href; }, 400);
  }

  function unfade() {
    fadingElements().forEach(function (el) { el.classList.remove('fading'); });
  }

  /* ------------------------------------------------------- the contact overlay */
  function runContact() {
    var overlay = document.getElementById('contact-overlay');
    if (!overlay) return;
    var closeBtn = document.getElementById('contact-close');
    var opener = null;
    var narrow = window.matchMedia('(max-width: 768px), (max-height: 500px)');

    document.querySelectorAll('[data-contact]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        /* Above the breakpoint the label opens a mail composition directly. */
        if (!narrow.matches) return;
        e.preventDefault();
        opener = link;
        open();
      });
    });

    function open() {
      overlay.hidden = false;
      requestAnimationFrame(function () { overlay.classList.add('open'); });
      if (closeBtn) closeBtn.focus();
      document.addEventListener('keydown', onKey);
    }
    function close() {
      overlay.classList.remove('open');
      overlay.hidden = true;
      document.removeEventListener('keydown', onKey);
      if (opener) opener.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      /* focus is trapped only here, and only while it is open */
      var items = overlay.querySelectorAll('a[href], button');
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (closeBtn) closeBtn.addEventListener('click', close);
  }

  /* ------------------------------------------------------------- the roster */
  function runRoster() {
    var roster = document.getElementById('roster');
    if (!roster) return;
    var entries = Array.prototype.slice.call(roster.querySelectorAll('[data-roster-entry]'));
    var buttons = Array.prototype.slice.call(roster.querySelectorAll('[data-filter-item]'));
    var marker = roster.querySelector('[data-filter-marker]');
    var live = roster.querySelector('[data-roster-live]');
    var empty = roster.querySelector('[data-roster-empty]');
    var well = document.getElementById('counter-well');
    var wellValue = document.getElementById('counter-value');
    var narrow = window.matchMedia('(max-width: 768px), (max-height: 500px)');

    var active = buttons.length ? buttons[0].dataset.discipline : null;
    var index = 0;

    function visible() {
      return entries.filter(function (el) { return el.dataset.discipline === active; });
    }

    function paint() {
      var set = visible();
      if (index >= set.length) index = 0;
      if (index < 0) index = Math.max(0, set.length - 1);
      entries.forEach(function (el) { el.hidden = true; });
      if (narrow.matches) {
        /* below the breakpoint the set becomes a scroll, one per screenful */
        set.forEach(function (el) { el.hidden = false; });
      } else if (set.length) {
        set[index].hidden = false;
      }
      buttons.forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.discipline === active ? 'true' : 'false');
      });
      if (marker) {
        var i = buttons.findIndex(function (b) { return b.dataset.discipline === active; });
        marker.style.transform = 'translateY(' + (Math.max(0, i) * 32) + 'px)';
      }
      if (empty) empty.hidden = set.length !== 0;
      if (well && wellValue && !narrow.matches === false) {
        /* the counter well tracks position within the set at a narrow width */
      }
      if (well && wellValue && narrow.matches && set.length) {
        well.dataset.role = 'count';
        well.style.display = 'block';
        wellValue.textContent = (index + 1) + '/' + set.length;
      }
      if (live && set.length) live.textContent = set[index].dataset.slug.replace(/-/g, ' ');
      /* reveal the portrait of whatever is now on screen */
      set.forEach(function (el) {
        el.querySelectorAll('[data-reveal]').forEach(function (r) {
          if (!narrow.matches || reduced) r.classList.add('revealed');
        });
      });
    }

    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        /* selecting a discipline filters the set and does not navigate */
        active = b.dataset.discipline;
        index = 0;
        paint();
      });
    });

    function advance(delta) {
      var set = visible();
      if (set.length < 2) return;
      index = (index + delta + set.length) % set.length;
      paint();
    }

    document.addEventListener('keydown', function (e) {
      if (narrow.matches) return;
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      /* arrow keys are a first-class input here */
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); advance(1); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); advance(-1); }
    });

    var wheelLock = 0;
    roster.addEventListener('wheel', function (e) {
      if (narrow.matches) return;
      e.preventDefault();
      var now = Date.now();
      if (now - wheelLock < 520) return;
      if (Math.abs(e.deltaY) < 8) return;
      wheelLock = now;
      advance(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    narrow.addEventListener('change', paint);
    paint();
  }

  /* --------------------------------------------------------------- Alpine */
  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({ 'Content-Type': 'application/json' },
                                    options.headers || {});
    var token = window.localStorage ? localStorage.getItem('cirrus_token') : null;
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    options.credentials = 'same-origin';
    return fetch(path, options).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) {
          /* an expired token mid-edit returns to the login route */
          if (r.status === 401 && path.indexOf('/api/studio/') === 0) {
            localStorage.removeItem('cirrus_token');
            location.href = '/studio/login?next=' + encodeURIComponent(location.pathname);
          }
          throw new Error(body.error || 'That did not work.');
        }
        return body;
      });
    });
  }

  window.cirrusApi = api;

  document.addEventListener('alpine:init', function () {
    window.Alpine.data('loginForm', function (next) {
      return {
        email: '', password: '', error: '', busy: false,
        submit: function () {
          var self = this;
          self.error = ''; self.busy = true;
          api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: self.email, password: self.password })
          }).then(function (data) {
            localStorage.setItem('cirrus_token', data.token);
            location.href = (data.account.role === 'producer' && data.account.house_id)
              ? (next || '/studio') : '/';
          }).catch(function (err) {
            /* a rejected form keeps what was typed and names what was wrong */
            self.error = err.message; self.busy = false;
          });
        }
      };
    });

    window.Alpine.data('signupForm', function () {
      return {
        email: '', password: '', error: '', busy: false,
        submit: function () {
          var self = this;
          self.error = ''; self.busy = true;
          api('/api/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email: self.email, password: self.password })
          }).then(function (data) {
            localStorage.setItem('cirrus_token', data.token);
            location.href = '/';
          }).catch(function (err) { self.error = err.message; self.busy = false; });
        }
      };
    });

    window.Alpine.data('palette', function () {
      var seed = [];
      var node = document.getElementById('studio-items');
      if (node) { try { seed = JSON.parse(node.textContent); } catch (e) { seed = []; } }
      return {
        q: '', items: seed, error: '', reorder: false, busy: false, cursor: 0,
        get filtered() {
          var q = this.q.trim().toLowerCase();
          if (!q) return this.items;
          return this.items.filter(function (i) {
            return i.title.toLowerCase().indexOf(q) !== -1 ||
                   i.slug.toLowerCase().indexOf(q) !== -1;
          });
        },
        get works() { return this.items.filter(function (i) { return i.kind === 'work'; }); },
        move: function (d) {
          var n = this.filtered.length;
          if (!n) return;
          this.cursor = (this.cursor + d + n) % n;
        },
        run: function () {
          var item = this.filtered[this.cursor];
          if (item) location.href = '/studio/items/' + item.id;
        },
        previewSelected: function () {
          var self = this;
          var item = this.filtered[this.cursor] || this.filtered[0];
          if (!item) { self.error = 'Choose a record to preview.'; return; }
          api('/api/studio/preview-tokens', {
            method: 'POST', body: JSON.stringify({ item_id: item.id })
          }).then(function (data) { location.href = '/preview/' + data.token; })
            .catch(function (err) { self.error = err.message; });
        },
        shift: function (i, d) {
          var works = this.works.slice();
          var j = i + d;
          if (j < 0 || j >= works.length) return;
          var tmp = works[i]; works[i] = works[j]; works[j] = tmp;
          var others = this.items.filter(function (x) { return x.kind !== 'work'; });
          this.items = works.concat(others);
        },
        saveOrder: function () {
          var self = this;
          self.busy = true; self.error = '';
          api('/api/studio/works/order', {
            method: 'POST',
            body: JSON.stringify({ ordered_ids: self.works.map(function (w) { return w.id; }) })
          }).then(function () { self.busy = false; self.reorder = false; })
            .catch(function (err) { self.error = err.message; self.busy = false; });
        },
        signOut: function () {
          api('/api/auth/logout', { method: 'POST' }).then(function () {
            localStorage.removeItem('cirrus_token');
            location.href = '/';
          });
        }
      };
    });

    window.Alpine.data('itemForm', function (kind) {
      var item = null;
      var node = document.getElementById('studio-item');
      if (node) { try { item = JSON.parse(node.textContent); } catch (e) { item = null; } }
      return {
        item: item, kind: kind, busy: false, error: '', notice: '',
        previewUrl: '', previewExpiry: '',
        form: {
          title: item ? item.title : '',
          slug: item ? item.slug : '',
          discipline: item ? (item.discipline || 'director') : 'director',
          variant: item ? (item.variant || 'left') : 'left'
        },
        poster: { alt: '', width: 598, height: 320 },
        media: { role: 'poster', alt: '', width: 598, height: 320 },
        credit: { role: '', name: '', talent_id: '' },
        slugify: function (t) {
          return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        },
        save: function () {
          var self = this;
          self.error = ''; self.notice = ''; self.busy = true;
          var slug = self.form.slug || self.slugify(self.form.title);
          if (!self.item) {
            var payload = {
              kind: self.kind, title: self.form.title, slug: slug,
              discipline: self.kind === 'talent' ? self.form.discipline : null,
              variant: self.kind === 'work' ? self.form.variant : null
            };
            api('/api/studio/items', { method: 'POST', body: JSON.stringify(payload) })
              .then(function (created) {
                var alt = self.poster.alt || (self.form.title + ' - portrait');
                return api('/api/studio/items/' + created.id + '/media', {
                  method: 'POST',
                  body: JSON.stringify({
                    role: 'poster', alt: alt,
                    width: self.poster.width || 598, height: self.poster.height || 320,
                    seed: slug + '-poster'
                  })
                }).then(function () { location.href = '/studio/items/' + created.id; });
              })
              .catch(function (err) { self.error = err.message; self.busy = false; });
            return;
          }
          var patch = { title: self.form.title };
          if (self.kind === 'talent') patch.discipline = self.form.discipline;
          else patch.variant = self.form.variant;
          api('/api/studio/items/' + self.item.id, {
            method: 'PATCH', body: JSON.stringify(patch)
          }).then(function (updated) {
            self.item = updated;
            if (slug && slug !== updated.slug) {
              return api('/api/studio/items/' + self.item.id + '/slug', {
                method: 'POST', body: JSON.stringify({ slug: slug })
              }).then(function (r) { self.item = r; self.form.slug = r.slug; });
            }
          }).then(function () {
            self.busy = false; self.notice = 'SAVED.';
          }).catch(function (err) { self.error = err.message; self.busy = false; });
        },
        addMedia: function () {
          var self = this;
          self.error = ''; self.notice = '';
          api('/api/studio/items/' + self.item.id + '/media', {
            method: 'POST',
            body: JSON.stringify({
              role: self.media.role, alt: self.media.alt,
              width: self.media.width, height: self.media.height,
              seed: self.item.slug + '-' + self.media.role + '-' + Date.now()
            })
          }).then(function () {
            return api('/api/studio/items/' + self.item.id);
          }).then(function (fresh) {
            self.item = fresh; self.media.alt = ''; self.notice = 'MEDIA ATTACHED.';
          }).catch(function (err) { self.error = err.message; });
        },
        addCredit: function () {
          var self = this;
          self.error = '';
          api('/api/studio/items/' + self.item.id + '/credits', {
            method: 'POST',
            body: JSON.stringify({
              role: self.credit.role, name: self.credit.name,
              talent_id: self.credit.talent_id || null
            })
          }).then(function () {
            self.credit = { role: '', name: '', talent_id: '' };
            self.notice = 'CREDIT ADDED.';
          }).catch(function (err) { self.error = err.message; });
        },
        mintPreview: function () {
          var self = this;
          self.error = '';
          api('/api/studio/preview-tokens', {
            method: 'POST', body: JSON.stringify({ item_id: self.item.id })
          }).then(function (data) {
            self.previewUrl = '/preview/' + data.token;
            self.previewExpiry = new Date(data.expires_at).toLocaleTimeString();
          }).catch(function (err) { self.error = err.message; });
        },
        setPublished: function (state) {
          var self = this;
          self.error = '';
          api('/api/studio/items/' + self.item.id + '/publish', {
            method: 'POST', body: JSON.stringify({ published: state })
          }).then(function (updated) {
            self.item = updated;
            location.href = '/studio/items/' + updated.id + '/published';
          }).catch(function (err) { self.error = err.message; });
        }
      };
    });
  });

  /* --------------------------------------------------------------- analytics */
  function runAnalytics() {
    /* Waits until the route is interactive, counts page views and nothing
       else, and fails quietly if it never arrives. */
    try {
      var send = function () {
        if (!window.navigator || !window.navigator.sendBeacon) return;
      };
      if (document.readyState === 'complete') send();
      else window.addEventListener('load', send, { once: true });
    } catch (e) { /* fails quietly */ }
  }

  function boot() {
    measure();
    runCounter();
    runCursor();
    runMedia();
    runReels();
    runBlur();
    runFooter();
    runRetraction();
    runTransitions();
    runContact();
    runRoster();
    runAnalytics();
    smoothLoop();
    document.querySelectorAll('.split').forEach(function (el) {
      el.closest('a, span') && el.classList.add('ready');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
