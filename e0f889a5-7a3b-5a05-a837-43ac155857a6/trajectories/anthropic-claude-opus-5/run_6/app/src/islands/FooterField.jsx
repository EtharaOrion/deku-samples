import { useEffect, useRef } from 'preact/hooks';

// A field of small dots in which the company name is drawn by the gaps between
// them. It carries no information and is not keyboard operable. If a drawing
// context cannot be acquired the footer renders its bottom row alone.
export default function FooterField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let dots = [];
    let raf = 0;
    let running = false;
    let onScreen = false;
    let pointer = { x: -9999, y: -9999, inside: false };
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const buildMask = (w, h) => {
      const m = document.createElement('canvas');
      m.width = w;
      m.height = h;
      const mc = m.getContext('2d');
      if (!mc) return null;
      mc.fillStyle = '#000';
      mc.fillRect(0, 0, w, h);
      mc.fillStyle = '#fff';
      mc.textAlign = 'center';
      mc.textBaseline = 'middle';
      const size = Math.min(w * 0.22, h * 0.8);
      mc.font = `700 ${size}px 'Vela Grotesk', system-ui, sans-serif`;
      mc.fillText('VELA', w / 2, h / 2);
      return mc.getImageData(0, 0, w, h).data;
    };

    const layout = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const mask = buildMask(w, h);
      const step = 9;
      dots = [];
      for (let y = step / 2; y < h; y += step) {
        for (let x = step / 2; x < w; x += step) {
          let inLetter = false;
          if (mask) {
            const idx = (Math.floor(y) * w + Math.floor(x)) * 4;
            inLetter = mask[idx] > 128;
          }
          // The name is drawn by the gaps: no dot where a letter is.
          if (inLetter) continue;
          dots.push({ x, y, e: 0 });
        }
      }
    };

    const draw = () => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      let awake = false;
      for (const d of dots) {
        if (pointer.inside) {
          const dx = d.x - pointer.x;
          const dy = d.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          const reach = 110;
          if (dist < reach) {
            const lift = 1 - dist / reach;
            if (lift > d.e) d.e = lift;
          }
        }
        if (d.e > 0.002) {
          // Decay back over about a second, immediately under reduced motion.
          d.e = reduced.matches ? 0 : d.e * 0.955;
          awake = true;
        } else {
          d.e = 0;
        }
        const alpha = 0.16 + d.e * 0.74;
        ctx.fillStyle = `hsl(40 16% 93% / ${alpha.toFixed(3)})`;
        const r = 1.1 + d.e * 1.5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      return awake;
    };

    const loop = () => {
      if (!running) return;
      const awake = draw();
      // The loop stops entirely when no dot is above rest and the pointer has left.
      if (!awake && !pointer.inside) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running || !onScreen) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };

    const move = (x, y) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: x - rect.left, y: y - rect.top, inside: true };
      start();
    };

    const onPointerMove = (e) => move(e.clientX, e.clientY);
    const onPointerLeave = () => {
      pointer.inside = false;
      start();
    };
    const onTouch = (e) => {
      const t = e.touches[0];
      if (t) move(t.clientX, t.clientY);
    };

    layout();
    draw();

    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0].isIntersecting;
        // Never runs while the canvas is off screen.
        if (onScreen) start();
        else running = false;
      },
      { threshold: 0.01 },
    );
    io.observe(canvas);

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('touchmove', onTouch, { passive: true });
    canvas.addEventListener('touchstart', onTouch, { passive: true });
    const onResize = () => {
      layout();
      draw();
    };
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('touchmove', onTouch);
      canvas.removeEventListener('touchstart', onTouch);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={ref} class="footer-field" aria-hidden="true" />;
}
