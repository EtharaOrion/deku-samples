/* Cirrus front end. It owns the rendered document's behaviour and nothing else:
   it decides nothing about who may see a record. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;
  var body = document.body;
  var route = body.getAttribute('data-route');

  /* ------------------------------------------------ one scroll source ---- */
  var scroll = {
    current: window.scrollY,
    target: window.scrollY,
    listeners: [],
    flag: false,
  };

  function onScroll(fn) { scroll.listeners.push(fn); }

  function emit() {
    for (var i = 0; i < scroll.listeners.length; i++) {
      try { scroll.listeners[i](scroll.current); } catch (e) { /* keep going */ }
    }
  }

  var flagTimer = null;
  function markInFlight() {
    if (!scroll.flag) {
      scroll.flag = true;
      document.documentElement.classList.add('is-scrolling');
    }
    clearTimeout(flagTimer);
    flagTimer = setTimeout(function () {
      scroll.flag = false;
      document.documentElement.classList.remove('is-scrolling');
    }, 140);
  }

  /* Smoothing is a lerp toward native scroll position, so keyboard scrolling,
     anchor navigation and find-in-page all keep working. */
  function scrollLoop() {
    scroll.target = window.scrollY;
    if (reduced) {
      scroll.current = scroll.target;
    } else {
      var delta = scroll.target - scroll.current;
      scroll.current += delta * 0.18;
      if (Math.abs(delta) < 0.05) scroll.current = scroll.target;
    }
    emit();
    requestAnimationFrame(scrollLoop);
  }
  window.addEventListener('scroll', markInFlight, { passive: true });
  requestAnimationFrame(scrollLoop);

  /* ------------------------------------------------ the cursor pair ------ */
  function cursorPair() {
    var el = document.getElementById('cursor');
    var square = document.getElementById('cursor-square');
    var label = document.getElementById('cursor-label');
    if (!el || coarse || reduced) { if (el) el.style.display = 'none'; return; }

    var pointer = { x: -999, y: -999 };
    var at = { x: -999, y: -999 };
    var seen = false;
    var last = performance.now();

    document.addEventListener('pointermove', function (event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!seen) {
        seen = true;
        at.x = pointer.x;
        at.y = pointer.y;
        el.style.transition = 'opacity 300ms ease';
        el.style.opacity = '1';
      }
      var target = event.target.closest('[data-cursor-label]');
      var text = target ? target.getAttribute('data-cursor-label') : '';
      if (label.textContent !== text) label.textContent = text;
      var suppress = event.target.closest('.no-cursor');
      square.style.opacity = suppress ? '0' : '1';
      el.classList.toggle('cursor--above',
        !!(target && target.hasAttribute('data-cursor-above')));
    }, { passive: true });

    function follow(now) {
      var dt = Math.min((now - last) / 16.6667, 4);
      last = now;
      if (seen) {
        /* frame-rate independent lag: it arrives a moment after the pointer */
        var k = 1 - Math.pow(1 - 0.08, dt);
        at.x += (pointer.x - at.x) * k;
        at.y += (pointer.y - at.y) * k;
        el.style.transform = 'translate3d(' + at.x + 'px,' + at.y + 'px,0)';
      }
      requestAnimationFrame(follow);
    }
    requestAnimationFrame(follow);
  }

  /* ------------------------------------------------ letter splitting ----- */
  function splitLabels() {
    if (reduced) return;
    var nodes = document.querySelectorAll('[data-split]');
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.dataset.splitDone) return;
      var word = node.getAttribute('data-split') || node.textContent.trim();
      node.dataset.splitDone = '1';
      /* the accessible name stays the whole word; the characters are hidden */
      node.setAttribute('aria-label', word);
      var frag = document.createDocumentFragment();
      var holder = document.createElement('span');
      holder.className = 'split';
      holder.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < word.length; i++) {
        var span = document.createElement('span');
        span.className = 'split__char';
        span.textContent = word[i];
        span.style.transform = 'translateY(14px)';
        span.style.transitionDelay = (i * 22) + 'ms';
        holder.appendChild(span);
      }
      frag.appendChild(holder);
      node.textContent = '';
      node.appendChild(frag);
      requestAnimationFrame(function () {
        Array.prototype.forEach.call(holder.children, function (span) {
          span.style.transform = 'translateY(0)';
        });
      });
    });
  }

  /* ------------------------------------------------ the media layer ------ */
  /* Plain composited images are the fallback path and the default: the same
     layout, the same reveals, the same hover behaviour. */
  function mediaLayer() {
    var stills = document.querySelectorAll('[data-still]');
    Array.prototype.forEach.call(stills, function (img) {
      function clear() {
        var tile = img.closest('.tile, [data-tile]') || img.parentElement;
        if (tile) tile.classList.add('tile--loaded');
        var frame = img.closest('.tile__frame');
        if (frame) frame.classList.add('tile--loaded');
      }
      if (img.complete) clear();
      img.addEventListener('load', clear);
      img.addEventListener('error', clear); /* clears on decode OR failure */
    });
  }

  /* Reels: never more than two run at once, none prepared until its still is
     within one window height, and suppressed under reduced motion or save-data. */
  function reels() {
    var saveData = navigator.connection && (navigator.connection.saveData ||
      /2g/.test(navigator.connection.effectiveType || ''));
    if (reduced || saveData) return;
    var frames = document.querySelectorAll('[data-reel]');
    if (!frames.length) return;
    var running = [];

    function stop(frame) {
      var i = running.indexOf(frame);
      if (i >= 0) running.splice(i, 1);
      if (frame._raf) { cancelAnimationFrame(frame._raf); frame._raf = null; }
      var canvas = frame.querySelector('canvas');
      if (canvas) canvas.remove();  /* the buffer is released */
      var still = frame.querySelector('[data-still]');
      if (still) still.style.visibility = '';
    }

    function start(frame) {
      if (frame._raf || running.length >= 2) return;
      var still = frame.querySelector('[data-still]');
      if (!still || !still.complete || !still.naturalWidth) return;
      var canvas = document.createElement('canvas');
      var w = frame.clientWidth || still.naturalWidth;
      var h = frame.clientHeight || still.naturalHeight;
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;' +
        'display:block;';
      canvas.setAttribute('aria-hidden', 'true');
      var ctx = canvas.getContext('2d');
      if (!ctx) return;  /* the rendering layer is unavailable: keep the still */
      frame.appendChild(canvas);
      running.push(frame);
      var t0 = performance.now();
      var dir = (frame.getAttribute('data-reel') || '').length % 2 ? 1 : -1;
      function draw(now) {
        var t = (now - t0) / 1000;
        var phase = (t % 12) / 12;                       /* a 12 second cycle */
        var shift = Math.sin(phase * Math.PI * 2) * canvas.width * 0.02 * dir;
        var bright = 1 + Math.sin(t / 7) * 0.03;         /* a slower cycle */
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.filter = 'brightness(' + bright + ')';
        ctx.drawImage(still, shift, 0, canvas.width, canvas.height);
        ctx.restore();
        frame._raf = requestAnimationFrame(draw);
      }
      /* the still stays visible beneath and is never replaced by a blank frame */
      frame._raf = requestAnimationFrame(draw);
    }

    function review() {
      var vh = window.innerHeight;
      Array.prototype.forEach.call(frames, function (frame) {
        var box = frame.getBoundingClientRect();
        var near = box.bottom > -vh && box.top < vh * 2;
        var inView = box.bottom > 0 && box.top < vh;
        if (near && inView) start(frame); else stop(frame);
      });
    }
    onScroll(review);
    window.addEventListener('resize', review);
    setTimeout(review, 600);
  }

  /* ------------------------------------------------ scrubbed effects ----- */
  function reveals() {
    var nodes = document.querySelectorAll('[data-reveal]');
    if (!nodes.length) return;
    if (reduced) {
      Array.prototype.forEach.call(nodes, function (n) {
        n.classList.add('reveal--in');
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal--in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    Array.prototype.forEach.call(nodes, function (n) { io.observe(n); });
  }

  /* The blur is scrubbed and reversible: scrolling back re-blurs. */
  function blurBlocks() {
    var nodes = document.querySelectorAll('[data-blur-block]');
    if (!nodes.length) return;
    var narrow = window.innerWidth <= 768 || window.innerHeight <= 500;
    if (reduced || narrow) {
      Array.prototype.forEach.call(nodes, function (n) {
        n.style.filter = 'blur(0px)';
        n.classList.add('blur-block--sharp');
      });
      return;
    }
    onScroll(function () {
      var vh = window.innerHeight;
      Array.prototype.forEach.call(nodes, function (n) {
        var box = n.getBoundingClientRect();
        var centre = box.top + box.height / 2;
        var distance = Math.abs(centre - vh / 2);
        var ratio = Math.min(1, distance / vh);   /* a screen away is full blur */
        n.style.filter = 'blur(' + (ratio * 10).toFixed(2) + 'px)';
      });
    });
  }

  /* The footer arrival: the site's only scroll-driven positional move. */
  function footerArrival() {
    var footer = document.querySelector('[data-footer]');
    if (!footer) return;
    onScroll(function () {
      var box = footer.getBoundingClientRect();
      footer.classList.toggle('footer--arrived',
        box.top < window.innerHeight * 0.92);
    });
  }

  /* Below the breakpoint the frame retracts on scroll: a threshold, not a scrub. */
  function frameRetraction() {
    var last = 0;
    onScroll(function (y) {
      if (window.innerWidth > 768 && window.innerHeight > 500) {
        body.classList.remove('is-retracted');
        return;
      }
      if (route !== 'works' && route !== 'about') return;
      if (y > last + 8 && y > 160) body.classList.add('is-retracted');
      else if (y < last - 8) body.classList.remove('is-retracted');
      last = y;
    });
  }

  /* ------------------------------------------------ the entry counter ---- */
  function entryCounter() {
    var veil = document.getElementById('veil');
    var well = document.getElementById('counter-well');
    if (!veil || veil.hasAttribute('hidden') || route === 'preview') return;

    var images = Array.prototype.slice.call(
      document.querySelectorAll('#cluster img'));
    var fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    var total = images.length + 2;   /* the stills, the fonts, the chrome */
    var done = 0;
    var shown = 0;

    function step() { done++; }

    images.forEach(function (img) {
      if (img.complete) step();
      else {
        img.addEventListener('load', step);
        img.addEventListener('error', step);
      }
    });
    fonts.then(step, step);
    if (document.readyState === 'complete') step();
    else window.addEventListener('load', step);

    function paint() {
      var real = Math.min(1, done / total);
      /* the counter reports real progress and never runs ahead of it */
      shown = Math.min(real, shown + 0.02);
      var pct = Math.round(shown * 100);
      well.textContent = pct + '%';
      /* the mark recomputes its own horizontal correction as the string widens */
      well.style.transform = 'translateX(' + (-well.offsetWidth / 2 + 22) + 'px)';
      if (shown >= 1) {
        veil.classList.add('veil--gone');
        setTimeout(function () { veil.setAttribute('hidden', ''); }, 500);
        return;
      }
      requestAnimationFrame(paint);
    }
    requestAnimationFrame(paint);
  }

  /* ------------------------------------------------ route transition ----- */
  function routeTransition() {
    if (reduced) return;
    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[data-nav-link]');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey ||
          event.button !== 0) return;
      var href = link.getAttribute('href');
      if (!href || href.charAt(0) !== '/') return;
      event.preventDefault();
      /* the frame, the counter well, the footer and the outgoing content
         all take one state class and fade together on the same 0.4s */
      body.classList.add('is-transitioning');
      setTimeout(function () { window.location.href = href; }, 400);
    });
    window.addEventListener('pageshow', function () {
      body.classList.remove('is-transitioning');
    });
  }

  /* ------------------------------------------------ contact overlay ------ */
  function contactOverlay() {
    var overlay = document.getElementById('contact-overlay');
    var close = document.getElementById('contact-close');
    if (!overlay) return;
    var opener = null;

    function isNarrow() {
      return window.innerWidth <= 768 || window.innerHeight <= 500;
    }
    function open(from) {
      opener = from;
      overlay.setAttribute('data-open', 'true');
      overlay.setAttribute('aria-hidden', 'false');
      close.focus();
    }
    function shut() {
      overlay.setAttribute('data-open', 'false');
      overlay.setAttribute('aria-hidden', 'true');
      if (opener) opener.focus();
    }
    document.addEventListener('click', function (event) {
      var link = event.target.closest('[data-contact]');
      if (!link) return;
      if (!isNarrow()) return;   /* above the breakpoint it opens mail directly */
      event.preventDefault();
      open(link);
    });
    close.addEventListener('click', shut);
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (overlay.getAttribute('data-open') === 'true') shut();
    });
    /* focus is trapped only inside the overlay while it is open */
    overlay.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      var focusable = overlay.querySelectorAll('a[href], button');
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    });
  }

  /* ------------------------------------------------ analytics ------------ */
  /* Waits until the route is interactive, counts page views and nothing else,
     and fails quietly if it never arrives. */
  function analytics() {
    function count() {
      try {
        var payload = { path: location.pathname };
        if (window.__cirrusCount) window.__cirrusCount(payload);
      } catch (e) { /* a loader that never arrives fails quietly */ }
    }
    if (document.readyState === 'complete') setTimeout(count, 0);
    else window.addEventListener('load', function () { setTimeout(count, 0); });
  }

  /* ------------------------------------------------ Alpine components ---- */
  var api = {
    call: function (path, options) {
      options = options || {};
      var headers = { 'Content-Type': 'application/json' };
      var token = null;
      try { token = window.localStorage.getItem('cirrus_token'); } catch (e) {}
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetch(path, {
        method: options.method || 'GET',
        headers: headers,
        credentials: 'same-origin',
        body: options.body ? JSON.stringify(options.body) : undefined,
      }).then(function (response) {
        return response.json().catch(function () { return {}; })
          .then(function (data) {
            if (!response.ok) {
              var err = new Error(data.error || 'That did not work.');
              err.status = response.status;
              throw err;
            }
            return data;
          });
      });
    },
  };

  function storeToken(token) {
    try { window.localStorage.setItem('cirrus_token', token); } catch (e) {}
  }
  function dropToken() {
    try { window.localStorage.removeItem('cirrus_token'); } catch (e) {}
  }

  /* An expired token mid-edit returns to the login with nothing half saved:
     the write was refused by the server, so there is nothing to roll back. */
  function expired(err) {
    if (err && err.status === 401) {
      dropToken();
      window.location.href = '/studio/login?next=' +
        encodeURIComponent(location.pathname);
      return true;
    }
    return false;
  }

  window.loginForm = function (next) {
    return {
      email: '', password: '', message: '', busy: false,
      submit: function () {
        var self = this;
        self.message = '';
        self.busy = true;
        api.call('/api/auth/login', {
          method: 'POST',
          body: { email: self.email, password: self.password },
        }).then(function (data) {
          storeToken(data.token);
          if (data.account.role !== 'producer') {
            window.location.href = '/';
            return;
          }
          window.location.href = next || '/studio';
        }).catch(function (err) {
          self.busy = false;
          /* a rejected form keeps what was typed and names what was wrong */
          self.message = err.message;
        });
      },
    };
  };

  window.signupForm = function () {
    return {
      email: '', password: '', message: '', busy: false,
      submit: function () {
        var self = this;
        self.message = '';
        self.busy = true;
        api.call('/api/auth/signup', {
          method: 'POST',
          body: { email: self.email, password: self.password },
        }).then(function (data) {
          storeToken(data.token);
          window.location.href = '/';
        }).catch(function (err) {
          self.busy = false;
          self.message = err.message;
        });
      },
    };
  };

  window.palette = function () {
    return {
      /* The records arrive in the document; the palette filters what is there
         and re-reads over the API after an action changes something. */
      query: '', items: [], loaded: false,
      actions: [
        { label: 'New talent', hint: 'CREATE', href: '/studio/talents/new' },
        { label: 'New work', hint: 'CREATE', href: '/studio/works/new' },
        { label: 'Reorder index', hint: 'WORKS', action: 'reorder' },
        { label: 'Preview', hint: 'A RECORD', action: 'preview' },
      ],
      load: function () {
        var self = this;
        api.call('/api/studio/items').then(function (rows) {
          self.items = rows;
          self.loaded = true;
        }).catch(function (err) {
          self.loaded = true;
          expired(err);
        });
      },
      matches: function (label) {
        var q = this.query.trim().toLowerCase();
        return !q || label.toLowerCase().indexOf(q) >= 0;
      },
      matchesItem: function (title, slug) {
        var q = this.query.trim().toLowerCase();
        return !q || (title || '').toLowerCase().indexOf(q) >= 0 ||
               (slug || '').toLowerCase().indexOf(q) >= 0;
      },
      matchingActions: function () {
        var self = this;
        return this.actions.filter(function (a) { return self.matches(a.label); });
      },
      matchingItems: function () {
        var self = this;
        return this.items.filter(function (item) {
          return self.matchesItem(item.title, item.slug);
        });
      },
      go: function (href) { window.location.href = href; },
      run: function (action) {
        var self = this;
        if (action.href) { this.go(action.href); return; }
        if (action.action === 'reorder') {
          var works = this.items.filter(function (i) { return i.kind === 'work'; });
          if (works.length < 2) return;
          var ids = works.map(function (i) { return i.id; });
          ids.push(ids.shift());
          api.call('/api/studio/works/order', {
            method: 'POST', body: { ordered_ids: ids },
          }).then(function () { window.location.reload(); })
            .catch(function (err) { expired(err); });
          return;
        }
        if (action.action === 'preview') {
          var target = this.matchingItems()[0];
          if (!target) return;
          api.call('/api/studio/preview-tokens', {
            method: 'POST', body: { item_id: target.id },
          }).then(function (data) { self.go(data.preview_path); })
            .catch(function (err) { expired(err); });
        }
      },
      signOut: function () {
        dropToken();
        api.call('/api/auth/logout', { method: 'POST' }).then(function () {
          window.location.href = '/';
        }).catch(function () { window.location.href = '/'; });
      },
    };
  };

  window.itemForm = function (kind) {
    var item = null;
    var holder = document.getElementById('record-data');
    if (holder) {
      try { item = JSON.parse(holder.textContent); } catch (e) { item = null; }
    }
    return {
      item: item,
      kind: item ? item.kind : kind,
      busy: false,
      message: '',
      previewPath: '',
      previewExpires: '',
      form: {
        title: item ? item.title : '',
        slug: item ? item.slug : '',
        discipline: (item && item.discipline) || 'director',
        variant: (item && item.variant) || 'left',
        alt: '',
        seed: Math.floor(Math.random() * 90000) + 1000,
      },
      hasPoster: function () {
        return !!(this.item && this.item.media.some(function (m) {
          return m.role === 'poster';
        }));
      },
      save: function () {
        var self = this;
        self.message = '';
        self.busy = true;
        if (self.item) {
          var patch = { title: self.form.title };
          if (self.kind === 'talent') patch.discipline = self.form.discipline;
          else patch.variant = self.form.variant;
          api.call('/api/studio/items/' + self.item.id, {
            method: 'PATCH', body: patch,
          }).then(function (data) {
            self.busy = false;
            self.item.title = data.title;
            self.message = 'SAVED.';
          }).catch(function (err) {
            self.busy = false;
            if (expired(err)) return;
            self.message = err.message;
          });
          return;
        }
        var payload = { kind: self.kind, title: self.form.title,
                        slug: self.form.slug || undefined };
        if (self.kind === 'talent') payload.discipline = self.form.discipline;
        else payload.variant = self.form.variant;
        api.call('/api/studio/items', { method: 'POST', body: payload })
          .then(function (created) {
            var media = {
              role: 'poster', seed: Number(self.form.seed) || 1,
              width: self.kind === 'talent' ? 246 : 598,
              height: self.kind === 'talent' ? 328 : 320,
              alt: self.form.alt,
            };
            return api.call('/api/studio/items/' + created.id + '/media', {
              method: 'POST', body: media,
            }).then(function () {
              window.location.href = '/studio/items/' + created.id;
            });
          }).catch(function (err) {
            self.busy = false;
            if (expired(err)) return;
            self.message = err.message;
          });
      },
      mintPreview: function () {
        var self = this;
        self.message = '';
        api.call('/api/studio/preview-tokens', {
          method: 'POST', body: { item_id: self.item.id },
        }).then(function (data) {
          self.previewPath = data.preview_path;
          self.previewExpires = data.expires_at;
        }).catch(function (err) {
          if (expired(err)) return;
          self.message = err.message;
        });
      },
      publish: function (want) {
        var self = this;
        self.message = '';
        api.call('/api/studio/items/' + self.item.id + '/publish', {
          method: 'POST', body: { published: want },
        }).then(function () {
          window.location.href = '/studio/items/' + self.item.id + '/published';
        }).catch(function (err) {
          if (expired(err)) return;
          self.message = err.message;
        });
      },
    };
  };

  window.roster = function () {
    return {
      active: '',
      index: 0,
      visible: [],
      all: [],
      init: function () {
        var self = this;
        var blocks = Array.prototype.slice.call(
          document.querySelectorAll('[data-talent-block]'));
        self.all = blocks.map(function (block, i) {
          return { i: i, discipline: block.getAttribute('data-discipline') };
        });
        var first = document.querySelector('.filter__button');
        self.active = first
          ? first.textContent.trim().toLowerCase()
          : (self.all[0] && self.all[0].discipline) || '';
        self.recompute();
        /* the set advances by wheel or trackpad as well as arrow key */
        var locked = false;
        window.addEventListener('wheel', function (event) {
          if (window.innerWidth <= 768 || window.innerHeight <= 500) return;
          if (locked) return;
          if (Math.abs(event.deltaY) < 8) return;
          locked = true;
          setTimeout(function () { locked = false; }, 480);
          self.advance(event.deltaY > 0 ? 1 : -1);
        }, { passive: true });
      },
      recompute: function () {
        var active = this.active;
        this.visible = this.all.filter(function (t) {
          return t.discipline === active;
        }).map(function (t) { return t.i; });
        this.index = 0;
      },
      select: function (discipline) {
        /* selecting filters the set and does not navigate */
        this.active = discipline;
        this.recompute();
      },
      advance: function (step) {
        if (!this.visible.length) return;
        this.index = (this.index + step + this.visible.length) %
          this.visible.length;
      },
      counter: function () {
        if (!this.visible.length) return '000 / 000';
        return ('00' + (this.index + 1)).slice(-3) + ' / ' +
          ('00' + this.visible.length).slice(-3);
      },
    };
  };

  /* ------------------------------------------------ boot ---------------- */
  function boot() {
    cursorPair();
    splitLabels();
    mediaLayer();
    reveals();
    blurBlocks();
    footerArrival();
    frameRetraction();
    entryCounter();
    routeTransition();
    contactOverlay();
    reels();
    analytics();
    emit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
