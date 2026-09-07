import { useEffect, useRef } from 'preact/hooks';

/**
 * A field of small dots arranged so the company name is drawn by the gaps
 * between them rather than by the dots themselves, which is why it reads as
 * shapes within a field rather than as bright letters.
 *
 * It carries no information, it is not keyboard operable, and if a drawing
 * context cannot be acquired the footer renders its bottom row alone and
 * nothing is lost.
 */
export default function FooterField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    // If a drawing context cannot be acquired, nothing is lost.
    if (!ctx) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const SPACING = 13;
    const REST = 0.16;
    const RADIUS = 128;
    // The wake decays back over about a second.
    const DECAY_PER_MS = 1 / 1000;

    let dots = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let last = 0;
    let pointer = { x: -9999, y: -9999, present: false };
    let visible = true;

    const ink = getComputedStyle(canvas).getPropertyValue('color').trim() || '#f4f1ec';

    /** Where the name is, so the dots there can be removed and leave the gaps. */
    function buildMask(w, h) {
      const off = document.createElement('canvas');
      off.width = Math.max(1, Math.floor(w));
      off.height = Math.max(1, Math.floor(h));
      const octx = off.getContext('2d');
      if (!octx) return null;
      const size = Math.min(h * 0.72, w / 4.2);
      octx.fillStyle = '#fff';
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      octx.font = `700 ${size}px 'Vela Grotesque', system-ui, sans-serif`;
      octx.fillText('VELA', off.width / 2, off.height / 2 + size * 0.02);
      return octx.getImageData(0, 0, off.width, off.height);
    }

    function layout() {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const mask = buildMask(width, height);
      dots = [];
      for (let y = SPACING / 2; y < height; y += SPACING) {
        for (let x = SPACING / 2; x < width; x += SPACING) {
          if (mask) {
            const px = (Math.floor(y) * mask.width + Math.floor(x)) * 4;
            // The name is the gaps: where the letterform is, no dot is placed.
            if (mask.data[px + 3] > 128) continue;
          }
          dots.push({ x, y, level: 0 });
        }
      }
    }

    function draw(now) {
      raf = 0;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;

      ctx.clearRect(0, 0, width, height);

      let alive = false;
      for (const dot of dots) {
        if (pointer.present) {
          const dx = dot.x - pointer.x;
          const dy = dot.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < RADIUS) {
            // Dots near the pointer brighten and fall off with distance.
            const target = 1 - dist / RADIUS;
            if (target > dot.level) dot.level = target;
          }
        }
        if (dot.level > 0) {
          // Under reduced motion the decay is immediate, so the field still
          // responds but leaves no wake.
          dot.level = reduced.matches ? 0 : Math.max(0, dot.level - dt * DECAY_PER_MS);
          if (dot.level > 0.002) alive = true;
        }

        const alpha = REST + dot.level * 0.72;
        const r = 1.1 + dot.level * 1.5;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // The loop stops entirely when no dot is above rest and the pointer has left.
      if ((alive || pointer.present) && visible) schedule();
      else last = 0;
    }

    function schedule() {
      if (!raf && visible) raf = requestAnimationFrame(draw);
    }

    const toLocal = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const onPointerMove = (e) => {
      const p = toLocal(e.clientX, e.clientY);
      pointer = { ...p, present: true };
      schedule();
    };
    const onPointerLeave = () => {
      pointer = { x: -9999, y: -9999, present: false };
      schedule();
    };
    // A touch point does the same with no drag, and never blocks the scroll.
    const onTouch = (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      const p = toLocal(t.clientX, t.clientY);
      pointer = { ...p, present: true };
      schedule();
    };

    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', onPointerMove, { passive: true });
    canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });
    canvas.addEventListener('touchmove', onTouch, { passive: true });
    canvas.addEventListener('touchstart', onTouch, { passive: true });
    canvas.addEventListener('touchend', onPointerLeave, { passive: true });

    // It never runs while the canvas is off screen.
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) schedule();
        else if (raf) { cancelAnimationFrame(raf); raf = 0; last = 0; }
      },
      { threshold: 0.01 },
    );
    io.observe(canvas);

    const ro = new ResizeObserver(() => { layout(); schedule(); });
    ro.observe(canvas);

    layout();
    schedule();

    return () => {
      io.disconnect();
      ro.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('touchmove', onTouch);
      canvas.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('touchend', onPointerLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      class="footer__canvas"
      aria-hidden="true"
      role="presentation"
    />
  );
}
