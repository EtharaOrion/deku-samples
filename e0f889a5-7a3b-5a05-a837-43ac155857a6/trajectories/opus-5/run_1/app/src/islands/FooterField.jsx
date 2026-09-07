import { useEffect, useRef } from 'preact/hooks';

// A field of small dots arranged so the company name is drawn by the gaps
// between them rather than by the dots themselves. It carries no information
// and is not keyboard operable. If a drawing context cannot be acquired the
// footer renders its bottom row alone and nothing is lost.
const WORD = 'VELA';

export default function FooterField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    let ctx;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const SPACING = 12;
    const REST = 0.16;
    let dots = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let pointer = { x: -9999, y: -9999, inside: false };
    let visible = true;
    let last = 0;

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Draw the word into an offscreen mask; a dot that lands on a letter is
      // dropped, so the name reads as the gaps in the field.
      const mask = document.createElement('canvas');
      mask.width = width;
      mask.height = height;
      const mctx = mask.getContext('2d');
      let letters = null;
      if (mctx) {
        mctx.fillStyle = '#fff';
        mctx.textAlign = 'center';
        mctx.textBaseline = 'middle';
        const size = Math.min(height * 0.86, (width / WORD.length) * 1.35);
        mctx.font = `700 ${Math.floor(size)}px 'Vela Grotesque', system-ui, sans-serif`;
        mctx.letterSpacing = `${Math.floor(size * 0.06)}px`;
        mctx.fillText(WORD, width / 2, height / 2);
        letters = mctx.getImageData(0, 0, width, height).data;
      }

      dots = [];
      for (let y = SPACING / 2; y < height; y += SPACING) {
        for (let x = SPACING / 2; x < width; x += SPACING) {
          if (letters) {
            const idx = ((Math.floor(y) * width) + Math.floor(x)) * 4 + 3;
            if (letters[idx] > 40) continue;
          }
          dots.push({ x, y, v: REST });
        }
      }
    };

    const draw = (now) => {
      raf = 0;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      ctx.clearRect(0, 0, width, height);

      // Dots near the pointer brighten and fall off with distance, then decay
      // back over about a second, so dragging leaves a fading wake.
      const decay = reduced.matches ? 1 : 1 - Math.exp(-dt / 320);
      let moving = false;

      for (const dot of dots) {
        let target = REST;
        if (pointer.inside) {
          const dx = dot.x - pointer.x;
          const dy = dot.y - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 96) target = Math.max(REST, 1 - dist / 96);
        }
        if (target > dot.v) dot.v = target;
        else dot.v += (target - dot.v) * decay;
        if (dot.v > REST + 0.01) moving = true;

        const alpha = Math.min(1, dot.v);
        ctx.fillStyle = `rgba(238, 233, 222, ${alpha.toFixed(3)})`;
        const r = 1.1 + alpha * 1.7;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // The loop stops entirely when no dot is above rest and the pointer has left.
      if ((moving || pointer.inside) && visible) raf = window.requestAnimationFrame(draw);
      else last = 0;
    };

    const kick = () => {
      if (!raf && visible) raf = window.requestAnimationFrame(draw);
    };

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const point = e.touches && e.touches.length ? e.touches[0] : e;
      pointer = { x: point.clientX - rect.left, y: point.clientY - rect.top, inside: true };
      kick();
    };
    const onLeave = () => {
      pointer = { x: -9999, y: -9999, inside: false };
      kick();
    };

    build();
    kick();

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointercancel', onLeave);

    const io = new IntersectionObserver((entries) => {
      // Never runs while the canvas is off screen.
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) kick();
      else if (raf) { window.cancelAnimationFrame(raf); raf = 0; last = 0; }
    }, { threshold: 0.01 });
    io.observe(canvas);

    const onResize = () => { build(); kick(); };
    window.addEventListener('resize', onResize);

    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointercancel', onLeave);
      window.removeEventListener('resize', onResize);
      io.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      class="footer-canvas"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
