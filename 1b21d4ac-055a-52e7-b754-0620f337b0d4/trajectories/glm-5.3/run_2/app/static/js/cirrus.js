/* Cirrus front end. The document is the truth; this only adds behaviour.
   One scroll source feeds every scrubbed property. No loops, no keyframes beyond
   the one cursor opacity entrance. */
(() => {
  const doc = document;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- state ---------- */
  const state = {
    route: document.body.dataset.route || 'index',
    scroll: 0, smooth: 0, inFlight: false,
    pointer: {x: 0, y: 0}, cursor: {x: -999, y: -999},
    cursorLabel: '', cursorOn: false, cursorOpts: null,
    progress: 0, progressDone: false,
    contactOpen: false, contactReturn: null,
  };

  /* ---------- letter split ---------- */
  function splitAll(root = document) {
    root.querySelectorAll('.split').forEach((el) => {
      if (el.dataset.splitDone) return;
      const text = (el.dataset.text || el.getAttribute('aria-label') || el.textContent || '').toUpperCase();
      if (!text) return;
      el.textContent = '';
      [...text].forEach((ch, i) => {
        const s = doc.createElement('span');
        s.className = 'ch';
        s.textContent = ch === ' ' ? '\u00a0' : ch;
        s.style.setProperty('--i', i);
        s.setAttribute('aria-hidden', 'true');
        el.appendChild(s);
      });
      el.setAttribute('aria-hidden', 'true');
      el.dataset.splitDone = '1';
      if (!el.dataset.text) el.removeAttribute('aria-label');
      const carrier = el.closest('a, button');
      if (carrier && !carrier.getAttribute('aria-label')) {
        carrier.setAttribute('aria-label', text.charAt(0) + text.slice(1).toLowerCase());
      }
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    });
  }

  /* ---------- pointer and cursor pair ---------- */
  const cursorEl = () => doc.querySelector('.cursor');
  let lastT = performance.now();
  function pointerMove(e) {
    state.pointer.x = e.clientX; state.pointer.y = e.clientY;
    if (!state.cursorOn) {
      state.cursorOn = true;
      const c = cursorEl();
      if (c) c.classList.add('is-live');
    }
    const t = e.target.closest ? e.target.closest('[data-cursor]') : null;
    if (t) state.cursorLabel = t.dataset.cursor;
    else {
      const link = e.target.closest ? e.target.closest('a, button, [data-cursor]') : null;
      state.cursorLabel = link ? (link.getAttribute('aria-label') || link.dataset.cursor || '') : '';
    }
    const host = e.target.closest ? e.target.closest('[data-cursor-directional]') : null;
    state.cursorOpts = host ? host.dataset.cursorDirectional : null;
    const noSquare = e.target.closest ? !!e.target.closest('.no-cursor, .still') : false;
    const c = cursorEl();
    if (c) {
      c.classList.toggle('no-square', noSquare);
      c.classList.toggle('is-directional', state.cursorOpts === 'up');
    }
  }
  doc.addEventListener('pointermove', pointerMove, {passive: true});

  function cursorFrame(now) {
    const dt = clamp((now - lastT) / 16.667, 0.2, 4);
    lastT = now;
    const k = 1 - Math.pow(1 - 0.08, dt);
    state.cursor.x += (state.pointer.x - state.cursor.x) * k;
    state.cursor.y += (state.pointer.y - state.cursor.y) * k;
    const c = cursorEl();
    if (c) {
      c.style.transform = `translate(${state.cursor.x + 14}px, ${state.cursor.y + 14}px)`;
      const label = c.querySelector('.cursor-label');
      if (label) {
        label.textContent = state.cursorLabel || '';
        c.style.setProperty('--cursor-op', state.cursorLabel ? '1' : '0');
      }
    }
    requestAnimationFrame(cursorFrame);
  }
  if (!coarse.matches && !reduced.matches) requestAnimationFrame(cursorFrame);

  /* ---------- one scroll source ---------- */
  const effects = [];
  let smoothRAF = null;
  function smoothStep() {
    const target = window.scrollY;
    const delta = target - state.smooth;
    if (Math.abs(delta) < 0.4) {
      state.smooth = target;
      state.inFlight = false;
      doc.documentElement.classList.remove('is-scrolling');
      runEffects();
      smoothRAF = null;
      return;
    }
    state.smooth += delta * 0.14;
    runEffects();
    smoothRAF = requestAnimationFrame(smoothStep);
  }
  function onScroll() {
    state.scroll = window.scrollY;
    if (reduced.matches) { state.smooth = window.scrollY; runEffects(); return; }
    if (!state.inFlight) {
      state.inFlight = true;
      doc.documentElement.classList.add('is-scrolling');
      if (!smoothRAF) smoothRAF = requestAnimationFrame(smoothStep);
    }
  }
  function runEffects() {
    const vh = window.innerHeight;
    for (const fx of effects) fx(state.smooth, vh, window.innerWidth);
  }
  window.addEventListener('scroll', onScroll, {passive: true});

  /* ---------- reveals ---------- */
  const revealObs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) { en.target.classList.add('is-revealed'); revealObs.unobserve(en.target); }
    }
  }, {rootMargin: '0px 0px -8% 0px'});
  function bindReveals(root = document) {
    root.querySelectorAll('[data-reveal]').forEach((el) => { if (!el.dataset.revealBound) { el.dataset.revealBound = '1'; revealObs.observe(el); } });
  }

  /* ---------- blur blocks, footer arrival, retraction ---------- */
  function bindScrollEffects(root = document) {
    root.querySelectorAll('[data-blur-block]').forEach((el) => {
      if (el.dataset.fx) return; el.dataset.fx = '1';
      if (window.innerWidth < 768 || reduced.matches) return;
      effects.push((y, vh) => {
        const r = el.getBoundingClientRect();
        const centre = r.top + window.scrollY + r.height / 2;
        const d = (centre - (y + vh / 2)) / vh;
        const t = clamp(1 - (d + 0.5), 0, 1);
        const radius = (1 - t) * 10;
        el.style.filter = radius < 0.15 ? 'none' : `blur(${radius.toFixed(2)}px)`;
      });
    });
    const footer = doc.querySelector('[data-footer]');
    if (footer && !footer.dataset.fx) {
      footer.dataset.fx = '1';
      const long = ['works', 'work-detail', 'talent-detail', 'about', 'studio'].includes(state.route);
      if (long) {
        effects.push((y, vh, vw) => {
          const max = doc.body.scrollHeight - vh;
          const t = clamp((y - max * 0.55) / (max * 0.45), 0, 1);
          const e = t * t * (3 - 2 * t);
          footer.style.setProperty('--arrival', e.toFixed(4));
          footer.style.transform = `translateY(${(1 - e) * 249.506}px)`;
          const scrim = footer.querySelector('.footer-scrim');
          if (scrim) scrim.style.opacity = e.toFixed(3);
        });
      }
    }
    if (['works', 'about'].includes(state.route) && window.innerWidth < 768) {
      const frame = doc.querySelector('.frame');
      let retracted = false;
      effects.push((y) => {
        const want = y > 80;
        if (want !== retracted) { retracted = want; frame.classList.toggle('is-retracted', want); }
      });
    }
  }

  /* ---------- reels ---------- */
  const reels = [];
  const reelObs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const r = en.target.__reel;
      if (!r) continue;
      if (en.isIntersecting) r.wanted = true; else { r.wanted = false; r.stop(); }
      scheduleReels();
    }
  }, {rootMargin: '100% 0px 100% 0px'});
  let reelBudget = 0;
  function scheduleReels() {
    const want = reels.filter((r) => r.wanted && !r.running && !r.suppressed);
    want.slice(0, Math.max(0, 2 - reelBudget)).forEach((r) => r.start());
    const running = reels.filter((r) => r.running && !r.wanted);
    running.forEach((r) => r.stop());
    const over = reels.filter((r) => r.running).slice(2);
    over.forEach((r) => r.stop());
  }
  function bindReels(root = document) {
    root.querySelectorAll('[data-reel]').forEach((el) => {
      if (el.__reel) return;
      const r = makeReel(el);
      if (!r) return;
      el.__reel = r; reels.push(r); reelObs.observe(el);
    });
  }
  function makeReel(fig) {
    const canvas = fig.querySelector('canvas');
    if (!canvas || reduced.matches || navigator.connection?.saveData ||
        (navigator.connection && navigator.connection.type === 'cellular')) return null;
    const ctx = canvas.getContext('2d', {alpha: false});
    if (!ctx) return null;
    const still = new Image();
    still.src = `/api/media/${fig.dataset.poster}`;
    const seed = parseInt((fig.dataset.poster || '1').slice(-6), 16) % 360;
    const dir = seed % 2 ? 1 : -1;
    return {
      wanted: false, running: false, suppressed: false, raf: null, t0: 0,
      start() {
        if (this.running) return;
        this.running = true; this.t0 = performance.now();
        const w = canvas.width, h = canvas.height;
        const draw = (now) => {
          if (!this.running) return;
          const t = (now - this.t0) / 1000;
          const phase = (t / 12) % 1;
          const bright = 0.96 + 0.08 * (0.5 + 0.5 * Math.sin((t / 9.3) * Math.PI * 2));
          if (still.complete && still.naturalWidth) {
            ctx.filter = `brightness(${bright.toFixed(3)})`;
            const off = dir * phase * 0.12;
            const sx = off < 0 ? 0 : Math.max(0, 1 - off);
            try { ctx.drawImage(still, off * w, 0, w, h); ctx.drawImage(still, (off - dir) * w, 0, w, h); } catch (e) {}
            ctx.filter = 'none';
            ctx.globalAlpha = 0.08;
            const g = grainPattern(ctx);
            if (g) { ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = '#060403'; ctx.fillRect(0, 0, w, h);
          }
          this.raf = requestAnimationFrame(draw);
        };
        this.raf = requestAnimationFrame(draw);
      },
      stop() {
        this.running = false;
        if (this.raf) cancelAnimationFrame(this.raf);
      },
    };
  }
  let _grain = null;
  function grainPattern(ctx) {
    if (_grain) return _grain;
    const img = new Image();
    img.src = '/static/media/grain.png';
    _grain = img;
    return null;
  }

  /* ---------- navigation with a persistent frame ---------- */
  async function navigate(href, {push = true} = {}) {
    const frame = doc.querySelector('.frame');
    const well = doc.getElementById('well');
    frame.classList.add('is-leaving');
    well.classList.add('is-leaving');
    await wait(400);
    const res = await fetch(href, {headers: {'X-Requested-With': 'cirrus'}});
    if (!res.ok && res.status !== 404) { location.href = href; return; }
    const html = new DOMParser().parseFromString(await res.text(), 'text/html');
    const newBody = html.body;
    document.title = html.title;
    document.body.dataset.route = newBody.dataset.route;
    document.body.className = newBody.className;
    // swap the centre mark and the well; the frame itself never unmounts
    const newMark = newBody.querySelector('.centre-mark');
    const oldMark = doc.querySelector('.centre-mark');
    if (newMark && oldMark) oldMark.innerHTML = newMark.innerHTML;
    well.innerHTML = newBody.querySelector('#well').innerHTML;
    window.scrollTo(0, 0);
    state.route = newBody.dataset.route;
    effects.length = 0;
    boot(well);
    if (push) history.pushState({cirrus: true}, '', href);
    requestAnimationFrame(() => {
      frame.classList.remove('is-leaving');
      well.classList.remove('is-leaving');
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const narrow = () => window.innerWidth < 768 || matchMedia('(pointer: coarse)').matches;
  doc.addEventListener('click', (e) => {
    const mail = e.target.closest('[data-mail]');
    if (mail) {
      e.preventDefault();
      if (narrow()) {
        state.contactReturn = mail;
        const f = window.__frame;
        if (f) {
          f.contactOpen = true;
          setTimeout(() => { const c = doc.querySelector('.contact-close'); if (c) c.focus(); }, 60);
        }
      } else {
        window.__cirrusMailTo = 'mailto:prod@example.com';
        window.location.href = window.__cirrusMailTo;
      }
      return;
    }
    const a = e.target.closest('a[data-nav], a:not([href^="http"]):not([href^="mailto"]):not([target])');
    if (!a || a.target || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('/studio')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  });
  window.addEventListener('popstate', () => {
    navigate(location.pathname, {push: false});
  });

  /* ---------- alpine components ---------- */
  document.addEventListener('alpine:init', () => {
    window.Alpine.data('frame', () => ({
      leaving: false,
      contactOpen: false,
      cursorLabel: '',
      onNavigate() {},
      closeContact() {
        if (!this.contactOpen) return;
        this.contactOpen = false;
        if (state.contactReturn) { state.contactReturn.focus(); state.contactReturn = null; }
      },
      init() {
        window.__frame = this;
        window.dispatchEvent(new CustomEvent('cirrus:ready'));
      },
    }));

    window.Alpine.data('entryCluster', () => ({
      progress: 0,
      done: false,
      shift: 0,
      init() {
        this.count();
        this.$watch('progress', () => { this.shift = this.opticalShift(); });
      },
      opticalShift() {
        // the counter recomputes its own horizontal correction as the string widens
        const el = this.$el.querySelector('.counter-num');
        const pct = this.$el.querySelector('.counter-pct');
        if (!el) return 0;
        const w = el.getBoundingClientRect().width + (pct ? pct.getBoundingClientRect().width : 0);
        return -(w * 0.06);
      },
      async count() {
        const el = this.$el;
        const stills = [...el.querySelectorAll('.cluster-still img')];
        const fonts = Promise.all([
          document.fonts.load('300 24px "Cirrus Display"'),
          document.fonts.load('500 12px "Cirrus Text"'),
        ]).catch(() => {});
        const imgs = stills.map((img) => new Promise((res) => {
          if (img.complete && img.naturalWidth) return res();
          img.addEventListener('load', res, {once: true});
          img.addEventListener('error', res, {once: true});
        }));
        const chrome = new Promise((res) => {
          if (document.readyState === 'complete') return res();
          window.addEventListener('load', res, {once: true});
          setTimeout(res, 6000);
        });
        const set = [
          fonts.then(() => 1),
          Promise.all(imgs).then(() => 1),
          chrome.then(() => 1),
        ];
        let done = 0;
        const bump = () => {
          done += 1;
          this.progress = Math.min(99, Math.round((done / set.length) * 100));
        };
        set.forEach((p) => Promise.resolve(p).then(bump).catch(bump));
        await Promise.allSettled(set);
        // never report 100 before the document is interactive
        if (document.readyState !== 'complete') {
          await new Promise((res) => { window.addEventListener('load', res, {once: true}); setTimeout(res, 6000); });
        }
        this.progress = 100;
        await new Promise((r) => setTimeout(r, 240));
        this.done = true;
      },
    }));

    window.Alpine.data('worksIndex', () => ({}));
    window.Alpine.data('workDetail', () => ({}));
    window.Alpine.data('talentDetail', () => ({}));
    window.Alpine.data('previewRoute', () => ({}));

    window.Alpine.data('roster', (talents, disciplines) => ({
      talents, disciplines,
      active: disciplines[0] || '',
      index: 0,
      init() {
        this.$watch('active', () => { this.index = 0; });
        let wheelLock = 0;
        const rosterEl = this.$el;
        rosterEl.addEventListener('wheel', (e) => {
          if (window.innerWidth < 768) return; // the narrow roster scrolls instead
          if (document.body.dataset.route !== 'talents') return;
          const now = performance.now();
          if (now - wheelLock < 420) return;
          wheelLock = now;
          this.advance(e.deltaY > 0 ? 1 : -1);
        }, {passive: true});
        window.addEventListener('keydown', (e) => {
          if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
          if (!document.body.dataset.route.startsWith('talent')) return;
          if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName) && document.activeElement.type !== 'button') return;
          this.advance(e.key === 'ArrowRight' ? 1 : -1);
        });
        this.fitNames();
        window.addEventListener('resize', () => this.fitNames());
      },
      get filtered() { return this.talents.filter((t) => t.discipline === this.active); },
      get current() { return this.filtered[this.index] || null; },
      get nowNum() { return String(Math.min(this.index + 1, Math.max(this.filtered.length, 1))).padStart(2, '0'); },
      get totalNum() { return String(Math.max(this.filtered.length, 1)).padStart(2, '0'); },
      visible(slug) { return this.current && this.current.slug === slug; },
      setDiscipline(d) { this.active = d; this.index = 0; },
      advance(dir) {
        const n = this.filtered.length;
        if (!n) return;
        this.index = (this.index + dir + n) % n;
        this.announce();
      },
      announce() {
        const live = doc.querySelector('.roster-screen');
        if (live) live.setAttribute('aria-live', 'polite');
      },
      get markerStyle() { return {top: '447px'}; },
      fitNames() {
        doc.querySelectorAll('.fit-name').forEach((el) => {
          el.style.fontSize = '';
          const max = 125;
          const vw = window.innerWidth, vh = window.innerHeight;
          if (vw < 768 || vh < 500) { el.style.fontSize = 'min(64px, 14vw)'; return; }
          const avail = vw * 0.86;
          let size = max;
          el.style.fontSize = size + 'px';
          while (size > 30 && el.scrollWidth > avail) { size -= 3; el.style.fontSize = size + 'px'; }
        });
      },
    }));

    window.Alpine.data('studioLogin', () => ({
      email: '', password: '', error: '', busy: false,
      async submit() {
        this.error = ''; this.busy = true;
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email: this.email, password: this.password}),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { this.error = data.error || 'Sign in refused. Check the address and password.'; return; }
          sessionStorage.setItem('cirrus_token', data.token);
          sessionStorage.setItem('cirrus_role', data.account ? data.account.role : data.role);
          location.href = '/studio';
        } catch (err) { this.error = 'The studio did not answer. Try again.'; }
        finally { this.busy = false; }
      },
    }));

    window.Alpine.data('signupForm', () => ({
      email: '', password: '', error: '', busy: false,
      async submit() {
        this.error = ''; this.busy = true;
        try {
          const res = await fetch('/api/auth/signup', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email: this.email, password: this.password}),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { this.error = data.error || 'Signup refused.'; return; }
          sessionStorage.setItem('cirrus_token', data.token);
          sessionStorage.setItem('cirrus_role', 'viewer');
          location.href = '/';
        } finally { this.busy = false; }
      },
    }));

    window.Alpine.data('studioPalette', (items) => ({
      items, q: '', paletteOpen: false, cursor: 0,
      actions: [
        {key: 'a-new-talent', kind: 'action', title: 'New talent', meta: 'CREATE'},
        {key: 'a-new-work', kind: 'action', title: 'New work', meta: 'CREATE'},
        {key: 'a-reorder', kind: 'action', title: 'Reorder index', meta: 'ORDER'},
      ],
      init() {
        window.addEventListener('keydown', (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.openPalette(); }
        });
      },
      get results() {
        const q = this.q.trim().toLowerCase();
        const records = this.items.map((it) => ({
          key: it.id, kind: 'record', kindLabel: it.kind.toUpperCase(),
          title: it.title, meta: (it.published ? 'LIVE · ' : 'HELD · ') + it.slug,
          href: `/studio/items/${it.id}`,
        }));
        const acts = this.actions.map((a) => ({
          ...a, kindLabel: 'ACTION',
          href: a.key === 'a-new-talent' ? '/studio/talents/new'
            : a.key === 'a-new-work' ? '/studio/works/new'
            : `/studio?reorder=1`,
        }));
        const all = [...acts, ...records];
        if (!q) return all.slice(0, 8);
        return all.filter((o) => (o.title + ' ' + (o.meta || '')).toLowerCase().includes(q));
      },
      openPalette() { this.paletteOpen = true; this.cursor = 0; this.$nextTick(() => this.$refs.paletteInput && this.$refs.paletteInput.focus()); },
      closePalette() { this.paletteOpen = false; },
      choose(opt) {
        this.closePalette();
        if (opt.href) location.href = opt.href;
      },
      async signout() {
        sessionStorage.removeItem('cirrus_token');
        sessionStorage.removeItem('cirrus_role');
        await fetch('/studio/logout', {method: 'GET'}).catch(() => {});
        location.href = '/';
      },
    }));

    window.Alpine.data('studioNew', (kind) => ({
      kind, title: '', slug: '', discipline: 'director', variant: 'left',
      error: '', busy: false,
      async submit() {
        this.error = ''; this.busy = true;
        try {
          const res = await studioFetch('/api/studio/items', {
            method: 'POST',
            body: JSON.stringify({kind: this.kind, slug: this.slug, title: this.title,
              discipline: this.kind === 'talent' ? this.discipline : undefined,
              variant: this.kind === 'work' ? this.variant : 'left'}),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { this.error = data.error || 'The record was not created.'; return; }
          location.href = `/studio/items/${data.id}`;
        } finally { this.busy = false; }
      },
    }));

    window.Alpine.data('studioItem', (item, media, credits) => ({
      item, media, credits,
      id: item.id, kind: item.kind,
      title: item.title, slug: item.slug,
      discipline: item.discipline || 'director', variant: item.variant || 'left',
      publishedWanted: !!item.published, published_at: item.published_at,
      published: !!item.published,
      error: '', note: '', busy: false,
      previewHref: '', talents: [], workOrder: [],
      newMedia: {role: 'poster', width: 598, height: 320, alt: ''},
      newCredit: {role: '', name: '', talent_id: ''},
      init() {
        if (this.kind === 'work') this.loadOrder();
        this.loadTalents();
      },
      get previewTokenHref() { return this.previewHref; },
      async loadTalents() {
        const res = await studioFetch('/api/studio/items?kind=talent');
        if (res.ok) this.talents = await res.json();
      },
      async loadOrder() {
        const res = await studioFetch('/api/studio/items?kind=work');
        if (res.ok) {
          const rows = await res.json();
          this.workOrder = rows.map((r) => ({id: r.id, title: r.title}));
        }
      },
      async save() {
        this.error = ''; this.note = ''; this.busy = true;
        try {
          const body = {title: this.title, slug: this.slug};
          if (this.kind === 'talent') body.discipline = this.discipline;
          else body.variant = this.variant;
          const res = await studioFetch(`/api/studio/items/${this.id}`, {method: 'PATCH', body: JSON.stringify(body)});
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { this.error = data.error || 'The record was not saved.'; return; }
          this.slug = data.slug; this.note = 'Saved.';
        } finally { this.busy = false; }
      },
      async publishToggle() {
        this.error = ''; this.busy = true;
        try {
          const res = await studioFetch(`/api/studio/items/${this.id}/publish`, {
            method: 'POST', body: JSON.stringify({published: this.publishedWanted})});
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            this.publishedWanted = !this.publishedWanted;
            this.error = data.error || 'That change was refused.';
            return;
          }
          if (data.published) { location.href = `/studio/items/${this.id}/published`; return; }
          this.published = false; this.published_at = null;
          this.note = 'Unlisted. The record left every public read.';
        } finally { this.busy = false; }
      },
      async mintPreview() {
        this.error = ''; this.busy = true;
        try {
          const res = await studioFetch('/api/studio/preview-tokens', {
            method: 'POST', body: JSON.stringify({item_id: this.id})});
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { this.error = data.error || 'No token was minted.'; return; }
          this.previewHref = `/preview/${data.token}`;
          this.note = `Preview minted, good for 15 minutes.`;
        } finally { this.busy = false; }
      },
      async addMedia() {
        this.error = ''; this.busy = true;
        try {
          const res = await studioFetch(`/api/studio/items/${this.id}/media`, {
            method: 'POST', body: JSON.stringify({...this.newMedia,
              seed: Math.floor(Math.random() * 1e9)})});
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { this.error = data.error || 'The media was not attached.'; return; }
          this.media.push({id: data.media_id, role: this.newMedia.role,
            width: this.newMedia.width, height: this.newMedia.height, alt: this.newMedia.alt});
          this.newMedia.alt = '';
        } finally { this.busy = false; }
      },
      async addCredit() {
        this.error = ''; this.busy = true;
        try {
          const res = await studioFetch(`/api/studio/items/${this.id}/credits`, {
            method: 'POST', body: JSON.stringify({...this.newCredit,
              talent_id: this.newCredit.talent_id || null})});
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { this.error = data.error || 'The credit was not added.'; return; }
          this.credits.push(data); this.newCredit = {role: '', name: '', talent_id: ''};
        } finally { this.busy = false; }
      },
      async moveWork(i, dir) {
        const j = i + dir; if (j < 0 || j >= this.workOrder.length) return;
        const arr = this.workOrder.slice();
        const [row] = arr.splice(i, 1); arr.splice(j, 0, row);
        this.workOrder = arr;
        const res = await studioFetch('/api/studio/works/order', {
          method: 'POST', body: JSON.stringify({ordered_ids: arr.map((r) => r.id)})});
        if (!res.ok) { this.error = 'The order was not saved.'; this.loadOrder(); }
      },
    }));
  });

  function studioFetch(url, opts = {}) {
    const token = sessionStorage.getItem('cirrus_token');
    return fetch(url, {
      ...opts,
      headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
    });
  }
  window.__studioFetch = studioFetch;

  /* ---------- boot ---------- */
  function fitCluster() {
    const cluster = doc.querySelector('.entry-cluster');
    if (!cluster) return;
    const scale = Math.min(window.innerWidth / 1440, window.innerHeight / 900);
    cluster.style.setProperty('--cluster-scale', String(Math.min(1, scale)));
  }
  window.addEventListener('resize', fitCluster);
  fitCluster();

  function boot(root = document) {
    splitAll(root);
    fitCluster();
    bindReveals(root);
    bindReels(root);
    bindScrollEffects(root);
    runEffects();
    // analytics waits until the route is interactive, counts page views and
    // nothing else, and fails quietly
    const whenIdle = (fn) => {
      if (document.readyState === 'complete') setTimeout(fn, 0);
      else window.addEventListener('load', () => setTimeout(fn, 0), {once: true});
    };
    whenIdle(() => {
      try {
        const payload = 'POST';
        fetch('/api/analytics/pageview', {method: payload, keepalive: true}).catch(() => {});
      } catch (e) { /* a loader that never arrives fails quietly */ }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot());
  } else boot();
})();
