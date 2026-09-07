/* Cirrus front end.
 * It reads what the backend already put in the document or answers over /api,
 * and it decides nothing about who may see a record. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;

  /* ------------------------------------------------------------------ marks */
  /* Every mark is inline vector geometry. No icon font, no sprite, no image. */
  var MARKS = {
    entry: '<svg width="41" height="18" viewBox="0 0 41 18" focusable="false" style="transform:translateX(-20.5px)">' +
      '<ellipse cx="20.5" cy="9" rx="19.75" ry="8.25" fill="none" stroke="currentColor" stroke-width="1.5" fill-rule="evenodd"/></svg>',
    works: '<svg width="14" height="18" viewBox="0 0 14 18" focusable="false" style="transform:translateX(-7px)">' +
      '<rect x="0" y="0" width="14" height="4"/><rect x="0" y="7" width="14" height="4"/>' +
      '<rect x="0" y="14" width="14" height="4"/></svg>',
    talents: '<svg width="18" height="18" viewBox="0 0 18 18" focusable="false" style="transform:translateX(-9px)">' +
      '<path d="M9 0.9A8.1 8.1 0 1 0 9 17.1A8.1 8.1 0 1 0 9 0.9 M9 2.4A6.6 6.6 0 1 1 9 15.6A6.6 6.6 0 1 1 9 2.4 ' +
      'M6.6 12.6V5.4h3.1a2.3 2.3 0 0 1 0 4.6H8.1v2.6z" fill-rule="evenodd"/></svg>',
    about: '<svg width="27" height="18" viewBox="0 0 27 18" focusable="false" style="transform:translateX(-13.5px)">' +
      '<circle cx="9" cy="9" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<circle cx="18" cy="9" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M13.5 3.2v11.6" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>'
  };
  function markFor(name) { return MARKS[name] || MARKS.entry; }

  /* --------------------------------------------------------- one scroll source */
  /* Every scrubbed property on the site is driven from here. Components register
   * a callback; they do not attach their own listener. */
  var Scroll = {
    y: 0, target: 0, max: 0, el: null, subs: [], flying: false, raf: null, idleTimer: null,
    init: function (el) {
      this.el = el;
      if (!el) return;
      var self = this;
      this.y = this.target = el.scrollTop;
      if (reduced) {
        // Reduced motion disables the smoothing entirely and returns native scroll.
        el.addEventListener('scroll', function () {
          self.y = self.target = el.scrollTop;
          self.measure();
          self.emit();
        }, { passive: true });
      } else {
        el.addEventListener('wheel', function (e) {
          if (e.ctrlKey) return;
          e.preventDefault();
          self.target = self.clamp(self.target + e.deltaY);
          self.start();
        }, { passive: false });
        // Keyboard scrolling, anchor navigation and find-in-page keep working:
        // native scroll is never blocked, only wheel input is smoothed.
        el.addEventListener('scroll', function () {
          if (!self.flying) { self.y = self.target = el.scrollTop; self.emit(); }
        }, { passive: true });
        var ty = 0;
        el.addEventListener('touchstart', function (e) { ty = e.touches[0].clientY; }, { passive: true });
        el.addEventListener('touchmove', function () { self.y = self.target = el.scrollTop; self.emit(); }, { passive: true });
      }
      window.addEventListener('resize', function () { self.measure(); self.emit(); });
      this.measure();
      this.emit();
    },
    clamp: function (v) { return Math.max(0, Math.min(v, this.max)); },
    measure: function () {
      if (!this.el) return;
      this.max = Math.max(0, this.el.scrollHeight - this.el.clientHeight);
    },
    start: function () {
      if (this.raf) return;
      var self = this;
      document.documentElement.classList.add('is-scrolling');
      var step = function () {
        self.flying = true;
        var d = self.target - self.y;
        if (Math.abs(d) < 0.4) {
          self.y = self.target;
          self.el.scrollTop = self.y;
          self.emit();
          self.raf = null;
          self.flying = false;
          clearTimeout(self.idleTimer);
          self.idleTimer = setTimeout(function () {
            document.documentElement.classList.remove('is-scrolling');
          }, 120);
          return;
        }
        self.y += d * 0.12;
        self.el.scrollTop = self.y;
        self.emit();
        self.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    },
    on: function (fn) { this.subs.push(fn); },
    /* The route tree swaps beneath the persistent frame, so each new route's
     * effects replace the last one's rather than accumulating on every
     * navigation. */
    reset: function () { this.subs = []; },
    emit: function () {
      this.measure();
      for (var i = 0; i < this.subs.length; i++) this.subs[i](this.y, this.max);
    }
  };
  window.CirrusScroll = Scroll;

  /* ------------------------------------------------------------- media layer */
  /* Stills are composited images with the reveal, the colour return and the
   * hover behaviour. A reel plays in place of its still, muted, looping, without
   * controls, only while in view, never more than two at once, and the still is
   * never replaced by a blank frame. */
  var Reels = {
    running: [],
    MAX: 2,
    suppressed: (function () {
      if (reduced) return true;
      var c = navigator.connection || {};
      if (c.saveData) return true;
      if (/2g/.test(c.effectiveType || '')) return true;
      return false;
    })(),
    observe: function (root) {
      var tiles = Array.prototype.slice.call(
        (root || document).querySelectorAll('.tile[data-reel]'));
      if (!tiles.length || this.suppressed) return;
      var self = this;
      // Measured against the one scroll source, for the same reason the reveal
      // is: a clipped tile has no intersection area to observe.
      var run = function () {
        var vh = window.innerHeight;
        tiles.forEach(function (t) {
          var r = t.getBoundingClientRect();
          // Nothing is prepared until its still is within one window height, and
          // a reel more than one window height away is stopped and released.
          if (r.top < vh * 2 && r.bottom > -vh) self.play(t);
          else self.stop(t);
        });
      };
      Scroll.on(run);
      run();
    },
    play: function (tile) {
      if (tile.__reel || this.running.length >= this.MAX) return;
      var img = tile.querySelector('.tile__img');
      if (!img || !img.complete || !img.naturalWidth) return;
      var canvas = document.createElement('canvas');
      canvas.className = 'tile__video';
      canvas.setAttribute('aria-hidden', 'true');
      var w = 320;
      var h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      tile.appendChild(canvas);
      var seed = 0, id = tile.getAttribute('data-reel') || '';
      for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 9973;
      var dir = (seed % 2) ? 1 : -1;
      var start = performance.now();
      var state = { raf: null, canvas: canvas };
      var frame = function (now) {
        var t = (now - start) / 1000;
        // Displace the still slowly along one axis on a 12 second cycle, and
        // vary brightness on a second slower cycle so the loop point is hidden.
        var phase = ((t % 12) / 12) * dir;
        var dx = phase * w * 0.06;
        var bright = 1 + Math.sin(t / 17 * Math.PI * 2) * 0.03;
        ctx.clearRect(0, 0, w, h);
        ctx.filter = 'brightness(' + bright + ')';
        ctx.drawImage(img, dx, 0, w, h);
        ctx.drawImage(img, dx - (dir > 0 ? w : -w), 0, w, h);
        ctx.filter = 'none';
        state.raf = requestAnimationFrame(frame);
      };
      state.raf = requestAnimationFrame(frame);
      tile.__reel = state;
      canvas.classList.add('is-playing');
      this.running.push(tile);
    },
    stop: function (tile) {
      var s = tile.__reel;
      if (!s) return;
      cancelAnimationFrame(s.raf);
      if (s.canvas && s.canvas.parentNode) s.canvas.parentNode.removeChild(s.canvas);
      tile.__reel = null;
      var i = this.running.indexOf(tile);
      if (i >= 0) this.running.splice(i, 1);
    }
  };

  /* Media containers clear their placeholder on decode or on failure. */
  function wireTiles(root) {
    var tiles = (root || document).querySelectorAll('.tile');
    tiles.forEach(function (tile) {
      var img = tile.querySelector('.tile__img');
      if (!img || tile.__wired) return;
      tile.__wired = true;
      var done = function () { tile.classList.add('is-decoded'); };
      if (img.complete) { done(); }
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    });
    revealTiles(root);
    Reels.observe(root);
  }

  /* The reveal is a wipe, uncovered from its bottom edge upward.
   *
   * Driven from the one scroll source rather than from an IntersectionObserver:
   * a tile at rest is clipped to `inset(100%)`, which leaves it no intersection
   * area at all, so an observer would never report it and the wipe would never
   * run. Registering a range against the shared source is also what the rest of
   * the scrubbed effects do. */
  function revealTiles(root) {
    var els = Array.prototype.slice.call(
      (root || document).querySelectorAll('.tile--reveal'));
    if (!els.length) return;
    if (reduced) {
      // Entries appear in place, with no wipe and no drift.
      els.forEach(function (e) { e.classList.add('is-revealed'); });
      return;
    }
    var pending = els.filter(function (e) {
      return !e.classList.contains('is-revealed');
    });
    var run = function () {
      if (!pending.length) return;
      var vh = window.innerHeight;
      pending = pending.filter(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < vh * 0.95 && r.bottom > 0) {
          // Hint the compositor only while the effect is running.
          el.style.willChange = 'clip-path, transform';
          el.classList.add('is-revealed');
          setTimeout(function () { el.style.willChange = ''; }, 900);
          return false;
        }
        return true;
      });
    };
    Scroll.on(run);
    run();
  }

  /* ------------------------------------------------- scrubbed blur and footer */
  function wireScrubbed() {
    var blurs = Array.prototype.slice.call(document.querySelectorAll('[data-blur]'));
    var footer = document.querySelector('[data-footer]');
    var narrow = function () {
      return window.innerWidth <= 768 || window.innerHeight <= 500;
    };

    if (blurs.length) {
      if (reduced) {
        // Resolves to its end state, not its start: the reader gets sharp text.
        blurs.forEach(function (b) { b.style.filter = 'none'; });
      } else {
        Scroll.on(function () {
          if (narrow()) {
            blurs.forEach(function (b) { b.style.filter = 'none'; });
            return;
          }
          var vh = window.innerHeight;
          blurs.forEach(function (b) {
            var r = b.getBoundingClientRect();
            var centre = r.top + r.height / 2;
            var d = Math.abs(centre - vh / 2);
            // Full blur a screen away, zero when its centre reaches the centre.
            var k = Math.max(0, Math.min(1, d / vh));
            var px = (k * 10).toFixed(2);
            b.style.filter = px > 0.05 ? 'blur(' + px + 'px)' : 'none';
          });
        });
      }
    }

    if (footer) {
      Scroll.on(function (y, max) {
        if (max <= 0) { footer.classList.add('is-arrived'); return; }
        // The movement occupies roughly the last third of the scroll.
        var p = (y - max * 0.66) / (max * 0.34 || 1);
        if (p > 0.15) footer.classList.add('is-arrived');
        else footer.classList.remove('is-arrived');
      });
    }

    // The frame retracts on scroll below the breakpoint: a threshold, not a scrub.
    var frame = document.getElementById('frame');
    if (frame) {
      var last = 0;
      Scroll.on(function (y) {
        if (!narrow()) { frame.classList.remove('frame--retracted'); return; }
        if (y > 120 && y > last) frame.classList.add('frame--retracted');
        else if (y < last - 4) frame.classList.remove('frame--retracted');
        last = y;
      });
    }
  }

  /* --------------------------------------------------------------- the shell */
  window.cirrusShell = function () {
    return {
      mark: (window.CIRRUS && window.CIRRUS.mark) || 'entry',
      counterText: '0%',
      counterDone: false,
      showCounter: true,
      contactOpen: false,
      _lastFocus: null,
      markFor: markFor,

      init: function () {
        var self = this;
        var route = (window.CIRRUS && window.CIRRUS.route) || 'entry';
        Scroll.init(this.$refs.well);
        wireTiles(document);
        wireScrubbed();
        this.cursor();
        this.softNav();
        this.analytics();

        if (route === 'entry' || route === 'preview') {
          this.runCounter();
        } else {
          this.showCounter = false;
          this.counterDone = true;
        }
        window.addEventListener('resize', function () { Scroll.emit(); });
      },

      /* The counter reports real progress against a defined set: the two font
       * files, the chrome and the cluster's own stills. Reels are not included
       * and are not fetched at this point. */
      runCounter: function () {
        var self = this;
        var imgs = Array.prototype.slice.call(document.querySelectorAll('.cluster .tile__img'));
        var fonts = document.fonts ? document.fonts.ready : Promise.resolve();
        var total = imgs.length + 2;
        var done = 0;
        var shown = 0;
        var settle = function () {
          done++;
        };
        imgs.forEach(function (img) {
          if (img.complete && img.naturalWidth) settle();
          else {
            img.addEventListener('load', settle);
            img.addEventListener('error', settle);
          }
        });
        fonts.then(function () { done += 2; });

        var tick = function () {
          var real = Math.round((done / total) * 100);
          // Never reports more than the real progress behind it.
          if (shown < real) shown = Math.min(real, shown + 3);
          self.counterText = shown + '%';
          self.recentre();
          if (shown >= 100) {
            self.counterText = '100%';
            setTimeout(function () {
              self.counterDone = true;
              setTimeout(function () { self.showCounter = false; }, 450);
            }, 120);
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        // A loader that never arrives fails quietly rather than putting an error
        // screen where the work should be.
        setTimeout(function () { done = total; }, 8000);
      },

      /* The counter recomputes its own horizontal correction as its string
       * widens; a static centre drifts by about half a character. */
      recentre: function () {
        var el = this.$refs.counterValue;
        if (!el) return;
        el.style.transform = 'translateX(' + (-el.offsetWidth / 2).toFixed(4) + 'px)';
      },

      /* The cursor pair: parked at (-999, -999) rather than hidden, following the
       * pointer with a frame-rate independent lag. */
      cursor: function () {
        if (coarse || reduced) return;
        var sq = this.$refs.cursorSquare, lb = this.$refs.cursorLabel;
        if (!sq || !lb) return;
        var px = -999, py = -999, x = -999, y = -999, label = '', up = false;
        sq.style.transform = 'translate(-999px, -999px)';
        lb.style.transform = 'translate(-999px, -999px)';
        var lastT = performance.now();

        document.addEventListener('pointermove', function (e) {
          px = e.clientX; py = e.clientY;
          if (!up) {
            up = true;
            x = px; y = py;
            sq.style.transition = 'opacity 300ms ease backwards';
            lb.style.transition = 'opacity 300ms ease backwards';
            sq.style.opacity = '1'; lb.style.opacity = '1';
          }
          var t = e.target.closest('[data-cursor-label]');
          var noSquare = e.target.closest('[data-no-cursor]');
          sq.style.visibility = noSquare ? 'hidden' : 'visible';
          var next = t ? (t.getAttribute('data-cursor-label') || '') : '';
          if (next !== label) { label = next; lb.textContent = label; }
          lb.style.visibility = label ? 'visible' : 'hidden';
        }, { passive: true });

        var loop = function (now) {
          var dt = Math.min(64, now - lastT); lastT = now;
          // Coefficient of about 0.08 per frame at 60fps, normalised on elapsed time.
          var k = 1 - Math.pow(1 - 0.08, dt / (1000 / 60));
          x += (px - x) * k; y += (py - y) * k;
          sq.style.transform = 'translate(' + (x - 5) + 'px,' + (y - 5) + 'px)';
          lb.style.transform = 'translate(' + x + 'px,' + (y - 6) + 'px)';
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      },

      /* The route transition. The persistent tree is never re-created: only the
       * well's contents are replaced, so the frame, the wordmark, the credit and
       * the cursor pair stay on screen throughout. */
      softNav: function () {
        var self = this;
        document.addEventListener('click', function (e) {
          var a = e.target.closest('a[data-nav]');
          if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          var url = new URL(a.href, location.href);
          if (url.origin !== location.origin) return;
          e.preventDefault();
          self.go(url.pathname + url.search);
        });
        window.addEventListener('popstate', function () {
          self.go(location.pathname + location.search, true);
        });
      },

      go: function (path, isPop) {
        var self = this;
        if (path === location.pathname + location.search && !isPop) return;
        var body = document.body;
        var apply = function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var incoming = doc.querySelector('.well');
          var well = self.$refs.well;
          if (!incoming || !well) { location.href = path; return; }
          well.innerHTML = incoming.innerHTML;
          document.title = doc.title;
          var newRoute = doc.body.getAttribute('data-route') || 'entry';
          body.setAttribute('data-route', newRoute);
          var newMark = (doc.querySelector('#centre-mark') || {}).getAttribute
            ? doc.querySelector('#centre-mark').getAttribute('data-mark') : 'entry';
          // The centre mark swaps to the new route's variant.
          self.mark = newMark || 'entry';
          document.querySelectorAll('.nav__link[data-nav]').forEach(function (l) {
            var p = new URL(l.href, location.href).pathname;
            if (p === '/' + newRoute || (newRoute === 'works' && p === '/works')
              || (newRoute === 'talents' && p === '/talents')
              || (newRoute === 'about' && p === '/about')) {
              l.setAttribute('aria-current', 'page');
            } else l.removeAttribute('aria-current');
          });
          if (!isPop) history.pushState({}, '', path);
          well.scrollTop = 0;
          Scroll.y = Scroll.target = 0;
          Scroll.reset();
          wireTiles(well);
          wireScrubbed();
          Scroll.emit();
          self.countView();
          setTimeout(function () { body.classList.remove('is-transitioning'); }, 20);
        };

        fetch(path, { headers: { 'X-Requested-With': 'cirrus' }, credentials: 'same-origin' })
          .then(function (r) { return r.text(); })
          .then(function (html) {
            if (reduced) { apply(html); return; }  // Transitions cut rather than fade.
            body.classList.add('is-transitioning');
            setTimeout(function () { apply(html); }, 400);
          })
          .catch(function () { location.href = path; });
      },

      /* Focus is never trapped except inside the contact overlay while it is
       * open, and it returns to the control that opened it on close. */
      trapContact: function (e) {
        if (!this.contactOpen || e.key !== 'Tab') return;
        var ov = this.$refs.contactOverlay;
        if (!ov) return;
        var items = ov.querySelectorAll('a[href], button');
        if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      },

      maybeOverlay: function (e) {
        // Below the breakpoint, where a nav label handing off to a mail client is
        // unreliable, CONTACT opens the overlay instead.
        if (window.innerWidth > 768 && window.innerHeight > 500) return;
        e.preventDefault();
        this._lastFocus = document.activeElement;
        this.contactOpen = true;
        var ov = this.$refs.contactOverlay;
        this.$nextTick(function () {
          var f = ov && ov.querySelector('button, a');
          if (f) f.focus();
        });
      },

      closeContact: function () {
        this.contactOpen = false;
        if (this._lastFocus) this._lastFocus.focus();
      },

      /* Analytics waits until the route is interactive, counts page views and
       * nothing else, and fails quietly. */
      analytics: function () {
        var self = this;
        if (document.readyState === 'complete') setTimeout(function () { self.countView(); }, 0);
        else window.addEventListener('load', function () { setTimeout(function () { self.countView(); }, 0); });
      },
      countView: function () {
        try {
          window.__cirrusViews = (window.__cirrusViews || 0) + 1;
        } catch (e) { /* fails quietly */ }
      }
    };
  };

  /* --------------------------------------------------------------- the roster */
  window.roster = function () {
    return {
      active: '',
      index: 0,
      count: 0,
      markerY: 0,
      announce: '',
      entries: [],
      visible: [],
      _wheelLock: 0,

      init: function () {
        var self = this;
        this.entries = Array.prototype.slice.call(
          this.$el.querySelectorAll('[data-talent]'));
        var buttons = this.$el.querySelectorAll('.roster__filter-item');
        // One discipline is always active and the first is active on arrival.
        if (buttons.length) this.active = buttons[0].getAttribute('data-discipline');
        this.apply();
        if (window.innerWidth > 768 && window.innerHeight > 500) {
          this.$el.addEventListener('wheel', function (e) {
            e.preventDefault();
            var now = Date.now();
            if (now - self._wheelLock < 420) return;
            self._wheelLock = now;
            self.advance(e.deltaY > 0 ? 1 : -1);
          }, { passive: false });
        }
      },

      select: function (d) {
        // Selecting a discipline filters the set and does not navigate.
        this.active = d;
        this.index = 0;
        this.apply();
      },

      apply: function () {
        var self = this;
        this.visible = this.entries.filter(function (e) {
          return e.getAttribute('data-discipline') === self.active;
        });
        this.count = this.visible.length;
        if (this.index >= this.count) this.index = 0;
        this.entries.forEach(function (e) {
          e.classList.remove('is-active');
          e.setAttribute('aria-hidden', 'true');
          e.style.display = 'none';
        });
        var wide = window.innerWidth > 768 && window.innerHeight > 500;
        this.visible.forEach(function (e, i) {
          e.style.display = '';
          if (!wide || i === self.index) {
            e.classList.add('is-active');
            e.removeAttribute('aria-hidden');
          }
        });
        var btns = Array.prototype.slice.call(
          this.$el.querySelectorAll('.roster__filter-item'));
        var i = btns.findIndex(function (b) {
          return b.getAttribute('data-discipline') === self.active;
        });
        this.markerY = 14 + Math.max(0, i) * 32;
        var cur = this.visible[this.index];
        this.announce = cur ? cur.getAttribute('data-name') + ', '
          + cur.getAttribute('data-discipline') : 'No talent in that discipline.';
      },

      advance: function (dir) {
        if (!this.count) return;
        this.index = (this.index + dir + this.count) % this.count;
        this.apply();
      },

      /* Arrow keys are a first-class input here rather than a fallback. */
      onKey: function (e) {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); this.advance(1); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); this.advance(-1); }
      }
    };
  };

  /* ---------------------------------------------------------------- the forms */
  function post(url, body, method) {
    return fetch(url, {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { ok: r.ok, status: r.status, data: d };
      });
    });
  }

  window.authForm = function (endpoint, next) {
    return {
      email: '', password: '', error: '', busy: false,
      submit: function () {
        var self = this;
        this.error = ''; this.busy = true;
        post(endpoint, { email: this.email, password: this.password })
          .then(function (res) {
            self.busy = false;
            if (!res.ok) {
              // Keeps what was typed and names what was wrong.
              self.error = res.data.error || 'That did not work.';
              return;
            }
            location.href = next || '/';
          })
          .catch(function () { self.busy = false; self.error = 'The network did not answer.'; });
      }
    };
  };

  window.palette = function () {
    return {
      q: '', message: '', reordering: false, visibleCount: 0,
      init: function () { this.recount(); },
      matches: function (el) {
        var q = this.q.trim().toLowerCase();
        if (!q) return true;
        return (el.getAttribute('data-title') || '').indexOf(q) >= 0
          || (el.getAttribute('data-slug') || '').indexOf(q) >= 0;
      },
      recount: function () {
        var self = this;
        this.$nextTick(function () {
          var cards = self.$el.querySelectorAll('[data-record]');
          var n = 0;
          cards.forEach(function (c) { if (self.matches(c)) n++; });
          self.visibleCount = n;
        });
      },
      reorder: function () {
        var self = this;
        this.reordering = true;
        fetch('/api/studio/items?kind=work', { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (items) {
            var ids = items.map(function (i) { return i.id; });
            ids.push(ids.shift());
            return post('/api/studio/works/order', { ordered_ids: ids });
          })
          .then(function (res) {
            self.reordering = false;
            self.message = res.ok ? 'The index order was rotated by one.'
              : (res.data.error || 'That did not work.');
          })
          .catch(function () { self.reordering = false; self.message = 'The network did not answer.'; });
      },
      previewFirst: function () {
        var self = this;
        fetch('/api/studio/items', { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (items) {
            var target = items.filter(function (i) { return !i.published; })[0] || items[0];
            if (!target) { self.message = 'There is no record to preview.'; return; }
            return post('/api/studio/preview-tokens', { item_id: target.id })
              .then(function (res) {
                if (res.ok) location.href = '/preview/' + res.data.token;
                else self.message = res.data.error || 'That did not work.';
              });
          })
          .catch(function () { self.message = 'The network did not answer.'; });
      },
      signOut: function () {
        post('/api/auth/logout', {}).then(function () { location.href = '/'; });
      }
    };
  };

  window.recordForm = function (kind) {
    return {
      kind: kind,
      title: '', slug: '', discipline: 'director', variant: 'left',
      alt: '', seed: Math.floor(Math.random() * 90000) + 1000,
      error: '', busy: false,
      syncSlug: function () {
        this.slug = this.title.toLowerCase().trim()
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      },
      submit: function () {
        var self = this;
        this.error = ''; this.busy = true;
        var payload = { kind: this.kind, slug: this.slug, title: this.title };
        if (this.kind === 'talent') payload.discipline = this.discipline;
        else payload.variant = this.variant;
        post('/api/studio/items', payload)
          .then(function (res) {
            if (!res.ok) {
              self.busy = false;
              self.error = res.data.error || 'That did not work.';
              return;
            }
            var id = res.data.id;
            var w = self.kind === 'talent' ? 246 : 598;
            var h = self.kind === 'talent' ? 328 : 320;
            return post('/api/studio/items/' + id + '/media', {
              role: 'poster', seed: Number(self.seed), width: w, height: h, alt: self.alt
            }).then(function (m) {
              self.busy = false;
              if (!m.ok) { self.error = m.data.error || 'The poster was refused.'; return; }
              location.href = '/studio/items/' + id;
            });
          })
          .catch(function () { self.busy = false; self.error = 'The network did not answer.'; });
      }
    };
  };

  window.editForm = function (id, kind, slug) {
    return {
      id: id, kind: kind,
      title: document.querySelector('.page-heading').textContent.trim(),
      discipline: 'director', variant: 'left',
      mediaRole: 'gallery', mediaAlt: '',
      newSlug: slug, previewHref: '', error: '', message: '', busy: false,

      handle: function (res, ok) {
        this.busy = false;
        if (!res.ok) {
          if (res.status === 401) { location.href = '/studio/login'; return false; }
          this.error = res.data.error || 'That did not work.';
          this.message = '';
          return false;
        }
        this.error = '';
        this.message = ok;
        return true;
      },
      save: function () {
        var self = this;
        this.busy = true;
        var body = { title: this.title };
        if (this.kind === 'talent') body.discipline = this.discipline;
        else body.variant = this.variant;
        post('/api/studio/items/' + this.id, body, 'PATCH')
          .then(function (r) { if (self.handle(r, 'Saved.')) location.reload(); });
      },
      addMedia: function () {
        var self = this;
        this.busy = true;
        post('/api/studio/items/' + this.id + '/media', {
          role: this.mediaRole, seed: Math.floor(Math.random() * 90000) + 1000,
          width: 598, height: 320, alt: this.mediaAlt
        }).then(function (r) { if (self.handle(r, 'Media attached.')) location.reload(); });
      },
      changeSlug: function () {
        var self = this;
        this.busy = true;
        post('/api/studio/items/' + this.id + '/slug', { slug: this.newSlug })
          .then(function (r) { if (self.handle(r, 'The old slug now redirects.')) location.reload(); });
      },
      mintPreview: function () {
        var self = this;
        this.busy = true;
        post('/api/studio/preview-tokens', { item_id: this.id })
          .then(function (r) {
            if (self.handle(r, 'A preview token is good for 15 minutes.')) {
              self.previewHref = '/preview/' + r.data.token;
            }
          });
      },
      setPublished: function (state) {
        var self = this;
        this.busy = true;
        post('/api/studio/items/' + this.id + '/publish', { published: state })
          .then(function (r) {
            if (self.handle(r, state ? 'Published.' : 'Unlisted.')) {
              location.href = '/studio/items/' + self.id + '/published';
            }
          });
      }
    };
  };
})();
