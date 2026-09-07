import { useEffect, useRef } from 'preact/hooks';

/**
 * A field of small dots arranged so the company name is drawn by the gaps between
 * them rather than by the dots themselves. It carries no information, is not
 * keyboard operable, and if a drawing context cannot be acquired the footer
 * renders its bottom row alone and nothing is lost.
 */
export default function FooterField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove(); // nothing is lost
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const SPACING = 9;
    const WORD = 'VELA';

    let dots = [];
    let raf = 0;
    let pointer = { x: -9999, y: -9999, inside: false };
    let visible = true;
    let width = 0;
    let height = 0;

    /** Measure the wordmark into a mask, then keep the dots that fall outside it. */
    const build = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(320, Math.floor(rect.width));
      height = Math.max(120, Math.round(width * 0.22));

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const mask = document.createElement('canvas');
      mask.width = width;
      mask.height = height;
      const mctx = mask.getContext('2d');
      if (!mctx) return;

      mctx.fillStyle = '#000';
      mctx.fillRect(0, 0, width, height);
      mctx.fillStyle = '#fff';
      mctx.textAlign = 'center';
      mctx.textBaseline = 'middle';

      let size = Math.floor(height * 0.92);
      mctx.font = `700 ${size}px "Vela Grotesque", system-ui, sans-serif`;
      while (mctx.measureText(WORD).width > width * 0.86 && size > 12) {
        size -= 2;
        mctx.font = `700 ${size}px "Vela Grotesque", system-ui, sans-serif`;
      }
      mctx.fillText(WORD, width / 2, height / 2);

      const data = mctx.getImageData(0, 0, width, height).data;
      dots = [];
      for (let y = SPACING / 2; y < height; y += SPACING) {
        for (let x = SPACING / 2; x < width; x += SPACING) {
          const i = (Math.floor(y) * width + Math.floor(x)) * 4;
          // Keep the dots outside the letterforms: the name is the gap.
          if (data[i] < 128) dots.push({ x, y, level: 0 });
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      let alive = false;

      for (const d of dots) {
        if (pointer.inside) {
          const dist = Math.hypot(d.x - pointer.x, d.y - pointer.y);
          const reach = 74;
          if (dist < reach) {
            const k = 1 - dist / reach;
            if (k > d.level) d.level = k;
          }
        }
        // Decay back over about a second; immediate under reduced motion.
        if (d.level > 0) {
          d.level = reduced.matches ? 0 : Math.max(0, d.level - 0.016);
          if (d.level > 0.002) alive = true;
        }

        const base = 0.16;
        const a = base + d.level * 0.72;
        const r = 1.15 + d.level * 1.5;
        ctx.beginPath();
        ctx.fillStyle = `rgba(238, 234, 226, ${a.toFixed(3)})`;
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // The loop stops entirely when no dot is above rest and the pointer has left.
      if ((alive || pointer.inside) && visible) raf = requestAnimationFrame(draw);
      else raf = 0;
    };

    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(draw);
    };

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top, inside: true };
      kick();
    };
    const onLeave = () => { pointer.inside = false; kick(); };
    const onTouch = (e) => {
      const t = e.touches[0];
      if (!t) return;
      const r = canvas.getBoundingClientRect();
      // A touch point does the same with no drag.
      pointer = { x: t.clientX - r.left, y: t.clientY - r.top, inside: true };
      kick();
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('touchstart', onTouch, { passive: true });
    canvas.addEventListener('touchmove', onTouch, { passive: true });
    canvas.addEventListener('touchend', onLeave, { passive: true });

    // Never runs while the canvas is off screen.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) kick();
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0.01 });
    io.observe(canvas);

    const onResize = () => { build(); kick(); };
    window.addEventListener('resize', onResize);

    build();
    draw();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div class="footer-canvas-wrap">
      <canvas ref={ref} class="footer-canvas" aria-hidden="true" />
    </div>
  );
}
