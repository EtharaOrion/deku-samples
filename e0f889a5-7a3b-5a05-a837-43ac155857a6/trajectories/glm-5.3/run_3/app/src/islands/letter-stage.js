// The letter drives two things: the film under the still, and the darkening
// panel, which is a pure function of scroll position. Nothing here is needed
// to read the letter: the markup carries the copy in normal flow.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const film = document.querySelector('.film');
const still = document.querySelector('.still');
const darken = document.querySelector('.darken');
const flat = document.querySelector('.flat');
const letter = document.querySelector('.letter');
const driven = document.querySelector('.letter-driven');
const flow = document.querySelector('.letter-body.flow');

still.style.background =
  'linear-gradient(160deg, hsl(28 14% 16%), hsl(32 18% 26%) 45%, hsl(26 12% 13%))';

let playing = false;
const metered = navigator.connection && (navigator.connection.saveData || navigator.connection.type === 'cellular');
const canPlay = !reduced && !metered;
const startFilm = () => {
  if (!canPlay || playing || film.getAttribute('src')) return;
  playing = true;
  film.src = '/film/table.mp4';
  film.play().then(() => { film.style.opacity = '1'; still.style.opacity = '0'; })
    .catch(() => { /* the still stays, and that is a complete rendering */ });
};
if (film) {
  new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !document.hidden) startFilm();
      else film.pause();
    }
  }, { threshold: 0.15 }).observe(document.querySelector('.stage'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) film.pause();
    else if (playing) film.play().catch(() => {});
  });
}

// The darkening: exact proportion to scroll, kept under reduced motion.
const update = () => {
  if (!letter) return;
  const r = letter.getBoundingClientRect();
  const gone = Math.min(Math.max(-r.top / Math.max(r.height, 1), 0), 1);
  darken.style.opacity = String(gone * 0.82);
  flat.style.opacity = String(Math.max(0, (gone - 0.9) / 0.1));
};
update();
addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
addEventListener('resize', update);

// On the narrow tier the driven layer shows and the flow layer stands down;
// the reverse on the wide tier, where paragraphs do not fade at all.
const tiers = () => {
  const wide = matchMedia('(min-width: 64rem)').matches;
  if (driven && flow) {
    driven.hidden = wide || reduced;
    flow.hidden = !wide && !reduced;
  }
  return wide;
};
tiers();
addEventListener('resize', tiers);

if (!reduced && driven) {
  const blocks = [...driven.children];
  const fade = () => {
    const wide = tiers();
    if (wide) return;
    const vh = innerHeight;
    for (const b of blocks) {
      const r = b.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const vis = Math.min(Math.max((vh * 0.85 - r.top) / (vh * 0.45), 0), 1);
      const out = Math.min(Math.max((r.bottom - vh * 0.12) / (vh * 0.3), 0), 1);
      b.style.opacity = String(Math.min(vis, out));
    }
  };
  fade();
  addEventListener('scroll', () => requestAnimationFrame(fade), { passive: true });
  addEventListener('resize', fade);
}

// Footer: a field of dots where the company name reads through the gaps.
class FootCanvas extends HTMLElement {
  connectedCallback() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return; // no drawing context: the bottom row alone is enough
    canvas.setAttribute('role', 'presentation');
    this.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = ctx;
    this.stopped = true;
    this.visible = false;
    new ResizeObserver(() => this.layout()).observe(this);
    this.addEventListener('pointermove', (e) => this.point(e));
    this.addEventListener('pointerdown', (e) => this.point(e));
    this.addEventListener('pointerleave', () => { this.px = null; this.wake(); });
    this.layout();
    new IntersectionObserver((es) => {
      this.visible = es[0].isIntersecting;
      if (this.visible) this.wake();
    }).observe(this);
  }
  layout() {
    const c = this.canvas;
    if (!c) return;
    const w = this.clientWidth || 320;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = Math.floor(w * dpr); c.height = Math.floor(150 * dpr);
    c.style.width = '100%'; c.style.height = '150px';
    this.dpr = dpr;
    this.step = 9;
    this.cols = Math.floor(w / this.step);
    this.rows = Math.floor(150 / this.step);
    const glyph = this.glyphMask(w);
    this.dots = [];
    for (let r = 0; r < this.rows; r++) {
      for (let col = 0; col < this.cols; col++) {
        const x = col * this.step + this.step / 2;
        const y = r * this.step + this.step / 2;
        this.dots.push({ x, y, inside: glyph(x, y), heat: 0 });
      }
    }
    this.wake();
  }
  glyphMask(w) {
    const off = document.createElement('canvas');
    off.width = Math.max(1, w); off.height = 150;
    const o = off.getContext('2d');
    o.fillStyle = '#fff';
    o.fillRect(0, 0, off.width, 150);
    o.fillStyle = '#000';
    const size = Math.max(24, Math.min(w * 0.2, 88));
    o.font = `700 ${size}px system-ui, sans-serif`;
    o.textAlign = 'center'; o.textBaseline = 'middle';
    o.fillText('vela', w / 2, 76);
    const data = o.getImageData(0, 0, off.width, 150).data;
    return (x, y) => {
      const xi = x | 0, yi = y | 0;
      if (yi < 0 || yi >= 150 || xi < 0 || xi >= off.width) return false;
      return data[(yi * off.width + xi) * 4] < 128;
    };
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    this.px = e.clientX - r.left; this.py = e.clientY - r.top;
    this.wake();
  }
  wake() {
    if (this.stopped && this.dots && (this.visible || this.px != null)) {
      this.stopped = false;
      requestAnimationFrame(() => this.tick());
    }
  }
  tick() {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dots = this.dots || [];
    let any = false;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const hasPointer = this.px != null && this.px !== undefined;
    for (const d of dots) {
      if (hasPointer) {
        const dist = Math.hypot(d.x - this.px, d.y - this.py);
        if (dist < 46) d.heat = Math.max(d.heat, 1 - dist / 46);
      }
      if (d.heat > 0) {
        d.heat = reducedMotion ? 0 : d.heat - 0.016;
        if (d.heat > 0) any = true; else d.heat = 0;
      }
      const rest = d.inside ? 0.08 : 0.32;
      const a = Math.min(1, rest + d.heat * 0.95);
      ctx.fillStyle = `rgba(228, 218, 204, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    if ((any || hasPointer) && this.visible !== false) requestAnimationFrame(() => this.tick());
    else this.stopped = true;
  }
}
customElements.define('foot-canvas', FootCanvas);
