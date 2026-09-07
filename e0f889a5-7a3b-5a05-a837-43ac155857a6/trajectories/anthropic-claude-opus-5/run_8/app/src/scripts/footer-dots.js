// The footer field. The company name is drawn by the gaps between the dots
// rather than by the dots themselves. It carries no information and is not
// keyboard operable. If a drawing context cannot be acquired, nothing is lost.

const canvas = document.getElementById('footer-canvas');
if (canvas) {
  const ctx = canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) {
    // The footer renders its bottom row alone.
    const wrap = canvas.closest('.footer-canvas-wrap');
    if (wrap) wrap.remove();
  } else {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const word = canvas.dataset.word || 'VELA';

    let dots = [];
    let pointer = { x: -1e6, y: -1e6, present: false };
    let running = false;
    let onScreen = false;
    let last = 0;

    function mask(w, h) {
      // Draw the word into an offscreen buffer; the dots that land inside it are
      // removed, so the name is the gap in the field.
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const o = off.getContext('2d');
      if (!o) return null;
      o.fillStyle = '#000';
      o.fillRect(0, 0, w, h);
      const size = Math.min(h * 0.78, (w / word.length) * 1.35);
      o.font = `700 ${size}px 'Vela Grotesque', system-ui, sans-serif`;
      o.textAlign = 'center';
      o.textBaseline = 'middle';
      o.fillStyle = '#fff';
      try { o.letterSpacing = `${size * 0.06}px`; } catch { /* older engines */ }
      o.fillText(word, w / 2, h / 2 + size * 0.02);
      try { return o.getImageData(0, 0, w, h).data; } catch { return null; }
    }

    function build() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const data = mask(w, h);
      const step = Math.max(7, Math.round(w / 150));
      dots = [];
      for (let y = step / 2; y < h; y += step) {
        for (let x = step / 2; x < w; x += step) {
          if (data) {
            const i = ((Math.floor(y) * w) + Math.floor(x)) * 4;
            if (data[i] > 128) continue; // inside a letter: leave the gap
          }
          dots.push({ x, y, e: 0 });
        }
      }
    }

    function draw(now) {
      running = true;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
      last = now;
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Under reduced motion the decay is immediate: the field still responds
      // but leaves no wake. Otherwise it decays back over about a second.
      const decay = reduced.matches ? 0 : Math.pow(0.36, dt);
      const radius = Math.max(48, rect.width * 0.09);
      let awake = false;

      for (const d of dots) {
        if (pointer.present) {
          const dx = d.x - pointer.x;
          const dy = d.y - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius) {
            const boost = 1 - dist / radius;
            if (boost > d.e) d.e = boost;
          }
        }
        d.e *= decay;
        if (d.e < 0.01) d.e = 0; else awake = true;
        const a = 0.10 + d.e * 0.72;
        ctx.fillStyle = `rgba(243, 244, 246, ${a.toFixed(3)})`;
        const r = 1 + d.e * 1.5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // The loop stops entirely when no dot is above rest and the pointer has left.
      if ((awake || pointer.present) && onScreen) {
        requestAnimationFrame(draw);
      } else {
        running = false;
        last = 0;
      }
    }

    function kick() {
      if (!running && onScreen) requestAnimationFrame(draw);
    }

    function at(e) {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top, present: true };
      kick();
    }

    canvas.addEventListener('pointermove', at);
    canvas.addEventListener('pointerdown', at);
    canvas.addEventListener('pointerleave', () => { pointer.present = false; kick(); });

    // Never runs while the canvas is off screen.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          onScreen = en.isIntersecting;
          if (onScreen) kick();
        }
      }, { rootMargin: '80px' });
      io.observe(canvas);
    } else {
      onScreen = true;
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { build(); kick(); }, 120);
    });

    build();
    kick();
    // The word is drawn with the display face, so rebuild once it has loaded.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { build(); kick(); });
    }
  }
}
