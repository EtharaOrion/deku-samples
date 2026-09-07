/* Alpine component factories. Defined before Alpine loads, since Alpine's deferred
   script initialises as soon as it parses. Everything here reads what the server already
   put in the document, or answers over /api. It decides nothing about who may see a record. */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function api(path, options) {
    options = options || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    var token = window.CIRRUS && window.CIRRUS.token;
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(path, {
      method: options.method || 'GET',
      headers: headers,
      credentials: 'same-origin',
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var err = new Error((data && data.error) || 'That did not work.');
          err.status = response.status;
          throw err;
        }
        return data;
      });
    });
  }
  window.cirrusApi = api;

  /* --------------------------------------------------------- the persistent shell */

  window.site = function () {
    return {
      route: document.documentElement.dataset.route || 'home',
      markFor: document.documentElement.dataset.route || 'home',
      transitioning: false,
      scrolling: false,
      veilVisible: document.documentElement.dataset.route === 'home',
      counterVisible: document.documentElement.dataset.route === 'home',
      counterText: '0%',
      counterShift: 0,
      footerEnabled: ['home', 'talents', 'preview'].indexOf(
        document.documentElement.dataset.route) === -1,
      footerArrived: reduced,
      contactOpen: false,
      contactOpener: null,
      narrow: window.matchMedia('(max-width: 768px), (max-height: 500px)').matches,

      boot: function () {
        var self = this;
        window.CIRRUS = window.CIRRUS || {};
        window.CIRRUS.shell = this;
        this.markFor = ['works', 'talents', 'about'].indexOf(this.route) !== -1
          ? this.route : 'home';
        window.addEventListener('resize', function () {
          self.narrow = window.matchMedia('(max-width: 768px), (max-height: 500px)').matches;
        });
        if (this.route === 'home') {
          this.runCounter();
        } else if (this.route === 'preview') {
          this.counterVisible = true;
          this.counterText = 'Loading preview...';
          setTimeout(function () { self.counterVisible = false; }, 400);
        } else {
          this.veilVisible = false;
        }
      },

      /* Real progress against a defined set: the fonts, the chrome and the cluster's stills. */
      runCounter: function () {
        var self = this;
        var stills = Array.prototype.slice.call(
          document.querySelectorAll('.cluster .tile-img'));
        var targets = stills.length + 2;
        var done = 0;
        var shown = 0;

        function bump() {
          done = Math.min(targets, done + 1);
          if (done >= targets) finish();
        }
        stills.forEach(function (img) {
          if (img.complete) { bump(); }
          else {
            img.addEventListener('load', bump, { once: true });
            img.addEventListener('error', bump, { once: true });
          }
        });
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(bump);
        } else { bump(); }
        window.addEventListener('load', bump, { once: true });

        var settled = false;
        function finish() {
          if (settled) return;
          settled = true;
          shown = 100;
          self.counterText = '100%';
          self.measureShift();
          setTimeout(function () {
            self.veilVisible = false;
            setTimeout(function () { self.counterVisible = false; }, 400);
          }, 160);
        }

        var tick = setInterval(function () {
          var real = Math.round((done / targets) * 100);
          if (shown < real) shown = Math.min(real, shown + 4);
          else if (shown < 96 && real > shown) shown = real;
          else if (shown < 96) shown = Math.min(shown + 1, Math.max(real, shown));
          self.counterText = shown + '%';
          self.measureShift();
          if (settled || shown >= 100) clearInterval(tick);
        }, 40);

        // A counter that reaches 100% before the page is ready is worse than no counter,
        // so this is a floor on the wait, not a substitute for it.
        setTimeout(function () { if (done >= targets) finish(); }, 300);
        setTimeout(finish, 6000);
      },

      /* Optical centring recomputed as the string widens from 0% to 100%. */
      measureShift: function () {
        var el = this.$el.querySelector('.counter-value');
        if (!el) return;
        this.counterShift = -(el.getBoundingClientRect().width / 2);
      },

      openContact: function (opener) {
        this.contactOpener = opener || null;
        this.contactOpen = true;
        var self = this;
        this.$nextTick(function () {
          var close = self.$refs.contactOverlay &&
            self.$refs.contactOverlay.querySelector('.contact-close');
          if (close) close.focus();
        });
      },
      closeContact: function () {
        this.contactOpen = false;
        if (this.contactOpener) this.contactOpener.focus();
      }
    };
  };

  /* --------------------------------------------------------- the roster */

  window.roster = function () {
    return {
      all: [],
      disciplines: [],
      active: null,
      index: 0,
      announcement: '',
      markerOffset: 0,
      wheelLock: 0,

      root: null,

      start: function () {
        var self = this;
        // $el is the directive's current element, so the component's own root is held once.
        this.root = this.$el.closest('.roster') || this.$el;
        // The filter labels and the discipline labels are the same derived set the server
        // already put in the document; they are never authored twice.
        this.disciplines = Array.prototype.slice.call(
          this.root.querySelectorAll('.filter-control')).map(function (b) {
            return b.dataset.discipline;
          });
        this.active = this.disciplines[0] || null;
        this.all = Array.prototype.slice.call(this.root.querySelectorAll('[data-talent]'))
          .map(function (node) {
            return {
              slug: node.dataset.slug,
              name: node.dataset.name,
              discipline: node.dataset.discipline
            };
          });
        this.index = 0;
        this.$nextTick(function () { self.moveMarker(); });
      },
      set: function () {
        var self = this;
        return this.all.filter(function (t) {
          return !self.active || t.discipline === self.active;
        });
      },
      get currentSlug() {
        var set = this.set();
        if (!set.length) return null;
        return set[Math.min(this.index, set.length - 1)].slug;
      },
      select: function (discipline) {
        this.active = discipline;
        this.index = 0;
        this.moveMarker();
        this.announce();
      },
      advance: function (step) {
        var set = this.set();
        if (!set.length) return;
        this.index = (this.index + step + set.length) % set.length;
        this.announce();
      },
      onWheel: function (event) {
        if (window.matchMedia('(max-width: 768px), (max-height: 500px)').matches) return;
        var now = Date.now();
        if (now - this.wheelLock < 700) return;
        if (Math.abs(event.deltaY) < 12) return;
        this.wheelLock = now;
        this.advance(event.deltaY > 0 ? 1 : -1);
      },
      announce: function () {
        var set = this.set();
        if (!set.length) { this.announcement = 'No talent in that discipline.'; return; }
        var current = set[Math.min(this.index, set.length - 1)];
        this.announcement = current.name + ', ' + current.discipline;
        if (window.CIRRUS && window.CIRRUS.shell) {
          window.CIRRUS.shell.counterText =
            String(Math.min(this.index, set.length - 1) + 1) + '/' + set.length;
        }
      },
      /* The marker square is placed from the active control's own position, read after
         the class has settled, so it moves beside the active word. */
      moveMarker: function () {
        var self = this;
        this.$nextTick(function () {
          var controls = Array.prototype.slice.call(
            self.root.querySelectorAll('.filter-control'));
          if (!controls.length) return;
          var index = self.disciplines.indexOf(self.active);
          var active = controls[index < 0 ? 0 : index];
          self.markerOffset = active.offsetTop - controls[0].offsetTop;
        });
      }
    };
  };

  /* --------------------------------------------------------- auth forms */

  function storeToken(token) {
    window.CIRRUS = window.CIRRUS || {};
    window.CIRRUS.token = token;
  }

  window.loginForm = function () {
    return {
      email: '', password: '', busy: false, errorText: '',
      submit: function () {
        var self = this;
        this.errorText = '';
        if (!this.email || !this.password) {
          this.errorText = 'Both an address and a password are needed.';
          return;
        }
        this.busy = true;
        api('/api/auth/login', {
          method: 'POST',
          body: { email: this.email, password: this.password }
        }).then(function (data) {
          storeToken(data.token);
          var params = new URLSearchParams(window.location.search);
          var next = params.get('next') || '/studio';
          if (next.charAt(0) !== '/' || next.slice(0, 2) === '//') next = '/studio';
          if (data.account && data.account.role !== 'producer') next = '/';
          window.location.assign(next);
        }).catch(function (err) {
          self.busy = false;
          self.errorText = err.message; // what was typed is kept
        });
      }
    };
  };

  window.signupForm = function () {
    return {
      email: '', password: '', busy: false, errorText: '', doneText: '',
      submit: function () {
        var self = this;
        this.errorText = ''; this.doneText = '';
        this.busy = true;
        api('/api/auth/signup', {
          method: 'POST',
          body: { email: this.email, password: this.password }
        }).then(function (data) {
          storeToken(data.token);
          self.busy = false;
          self.doneText = 'Account created. You can read every public page.';
          setTimeout(function () { window.location.assign('/'); }, 900);
        }).catch(function (err) {
          self.busy = false;
          self.errorText = err.message;
        });
      }
    };
  };

  /* --------------------------------------------------------- the command palette */

  window.palette = function (items) {
    return {
      items: items || [],
      term: '',
      cursor: 0,
      reorderOpen: false,
      order: [],
      errorText: '',
      noteText: '',
      noteHref: '',

      focusInput: function () {
        var self = this;
        this.order = this.items.filter(function (i) { return i.kind === 'work'; }).slice();
        this.$nextTick(function () { if (self.$refs.input) self.$refs.input.focus(); });
      },
      filtered: function () {
        var term = this.term.trim().toLowerCase();
        if (!term) return this.items;
        return this.items.filter(function (item) {
          return (item.title || '').toLowerCase().indexOf(term) !== -1
            || (item.slug || '').toLowerCase().indexOf(term) !== -1;
        });
      },
      works: function () { return this.order; },
      move: function (step) {
        var list = this.filtered();
        if (!list.length) return;
        this.cursor = (this.cursor + step + list.length) % list.length;
      },
      run: function () {
        var list = this.filtered();
        if (!list.length) return;
        var item = list[Math.min(this.cursor, list.length - 1)];
        window.location.assign('/studio/items/' + item.id);
      },
      previewFirst: function () {
        var self = this;
        var list = this.filtered();
        var target = list.filter(function (i) { return !i.published; })[0] || list[0];
        if (!target) { this.errorText = 'There is no record to preview.'; return; }
        this.errorText = ''; this.noteText = ''; this.noteHref = '';
        api('/api/studio/preview-tokens', {
          method: 'POST', body: { item_id: target.id }
        }).then(function (data) {
          self.noteText = 'Preview of ' + target.title + ', good for fifteen minutes:';
          self.noteHref = '/preview/' + data.token;
        }).catch(function (err) { self.errorText = err.message; });
      },
      nudge: function (index, step) {
        var target = index + step;
        if (target < 0 || target >= this.order.length) return;
        var copy = this.order.slice();
        var moved = copy.splice(index, 1)[0];
        copy.splice(target, 0, moved);
        this.order = copy;
      },
      saveOrder: function () {
        var self = this;
        this.errorText = ''; this.noteText = ''; this.noteHref = '';
        api('/api/studio/works/order', {
          method: 'POST',
          body: { ordered_ids: this.order.map(function (w) { return w.id; }) }
        }).then(function () {
          self.noteText = 'The index is in its new order.';
        }).catch(function (err) { self.errorText = err.message; });
      },
      signOut: function () {
        api('/api/auth/logout', { method: 'POST' }).then(function () {
          window.CIRRUS.token = null;
          window.location.assign('/');
        });
      }
    };
  };

  /* --------------------------------------------------------- the studio record form */

  window.itemForm = function (record, mode, kind) {
    return {
      record: record || {},
      mode: mode,
      kind: kind,
      busy: false,
      errorText: '',
      noteText: '',
      noteHref: '',
      previewUrl: '',
      newSlug: (record && record.slug) || '',
      form: {
        title: (record && record.title) || '',
        slug: (record && record.slug) || '',
        discipline: (record && record.discipline) || 'director',
        variant: (record && record.variant) || 'left',
        alt: '',
        seed: ''
      },
      media: { role: 'gallery', alt: '', seed: '', width: 598, height: 320 },
      credit: { role: '', name: '', talent_id: '' },

      save: function () {
        var self = this;
        this.errorText = ''; this.noteText = '';
        if (!this.form.title.trim()) {
          this.errorText = 'A title is required.'; // what was typed is kept
          return;
        }
        this.busy = true;
        if (this.mode === 'new') {
          if (!this.form.alt.trim()) {
            this.busy = false;
            this.errorText = 'The poster needs a written alternative before it can be published.';
            return;
          }
          api('/api/studio/items', {
            method: 'POST',
            body: {
              kind: this.kind, title: this.form.title, slug: this.form.slug,
              discipline: this.kind === 'talent' ? this.form.discipline : null,
              variant: this.kind === 'work' ? this.form.variant : null
            }
          }).then(function (created) {
            return api('/api/studio/items/' + created.id + '/media', {
              method: 'POST',
              body: {
                role: 'poster', alt: self.form.alt,
                seed: self.form.seed || created.slug + '-poster',
                width: self.kind === 'talent' ? 246 : 598,
                height: self.kind === 'talent' ? 330 : 320
              }
            }).then(function () {
              window.location.assign('/studio/items/' + created.id);
            });
          }).catch(function (err) {
            self.busy = false;
            self.errorText = err.message;
          });
          return;
        }
        var body = { title: this.form.title };
        if (this.kind === 'talent') body.discipline = this.form.discipline;
        else body.variant = this.form.variant;
        api('/api/studio/items/' + this.record.id, { method: 'PATCH', body: body })
          .then(function (updated) {
            self.busy = false;
            self.record = updated;
            self.noteText = 'Saved.';
          }).catch(function (err) {
            self.busy = false;
            self.errorText = err.message;
          });
      },

      mintPreview: function () {
        var self = this;
        this.errorText = '';
        api('/api/studio/preview-tokens', {
          method: 'POST', body: { item_id: this.record.id }
        }).then(function (data) {
          self.previewUrl = '/preview/' + data.token;
          self.noteText = 'A preview token, good for fifteen minutes:';
          self.noteHref = self.previewUrl;
        }).catch(function (err) { self.errorText = err.message; });
      },

      publish: function (state) {
        var self = this;
        this.errorText = ''; this.noteText = '';
        api('/api/studio/items/' + this.record.id + '/publish', {
          method: 'POST', body: { published: state }
        }).then(function () {
          window.location.assign('/studio/items/' + self.record.id + '/published');
        }).catch(function (err) { self.errorText = err.message; });
      },

      changeSlug: function () {
        var self = this;
        this.errorText = ''; this.noteText = '';
        api('/api/studio/items/' + this.record.id + '/slug', {
          method: 'POST', body: { slug: this.newSlug }
        }).then(function (updated) {
          self.record = updated;
          self.noteText = 'The new address is live and the old one still redirects.';
        }).catch(function (err) { self.errorText = err.message; });
      },

      addMedia: function () {
        var self = this;
        this.errorText = ''; this.noteText = '';
        api('/api/studio/items/' + this.record.id + '/media', {
          method: 'POST', body: this.media
        }).then(function () {
          return api('/api/studio/items/' + self.record.id).then(function (fresh) {
            self.record = fresh;
            self.noteText = 'Media attached.';
            self.media = { role: 'gallery', alt: '', seed: '', width: 598, height: 320 };
          });
        }).catch(function (err) { self.errorText = err.message; });
      },

      addCredit: function () {
        var self = this;
        this.errorText = ''; this.noteText = '';
        api('/api/studio/items/' + this.record.id + '/credits', {
          method: 'POST',
          body: {
            role: this.credit.role, name: this.credit.name,
            talent_id: this.credit.talent_id || null
          }
        }).then(function () {
          self.noteText = 'Credit added.';
          self.credit = { role: '', name: '', talent_id: '' };
        }).catch(function (err) { self.errorText = err.message; });
      }
    };
  };
})();
