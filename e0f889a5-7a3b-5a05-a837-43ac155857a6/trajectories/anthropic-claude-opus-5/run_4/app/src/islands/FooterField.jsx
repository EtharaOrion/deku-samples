import { useEffect, useRef } from 'preact/hooks';

/**
 * A field of small dots arranged so the company name is drawn by the gaps
 * between them rather than by the dots themselves, which is why it reads as
 * shapes within a field rather than as bright letters.
 *
 * Dots near the pointer brighten and fall off with distance, then decay back
 * over about a second, so dragging leaves a fading wake. The loop stops
 * entirely when no dot is above rest and the pointer has left, and never runs
 * while the canvas is off screen. It carries no information and is not keyboard
 * operable. If a drawing context cannot be acquired the footer renders its
 * bottom row alone and nothing is lost.
 */
export default function FooterField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    // Nothing is lost when there is no drawing context.
    if (!ctx) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let dots = [];
    let raf = 0;
    let running = false;
    let onScreen = true;
    const pointer = { x: -9999, y: -9999, inside: false };

    const SPACING = 13;
    const RADIUS = 1.5;

    /** The name is cut out of the field: a dot inside a letter is removed. */
    function build() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;

      // Draw the word to an offscreen mask, then keep only the dots that fall
      // outside its strokes.
      const mask = document.createElement('canvas');
      mask.width = Math.max(1, Math.floor(w));
      mask.height = Math.max(1, Math.floor(h));
      const mctx = mask.getContext('2d');
      let sample = null;
      if (mctx) {
        const size = Math.min(w * 0.34, h * 0.92);
        mctx.fillStyle = '#000';
        mctx.font = `700 ${size}px Archivo, system-ui, sans-serif`;
        mctx.textAlign = 'center';
        mctx.textBaseline = 'middle';
        mctx.fillText('vela', w / 2, h / 2);
        try {
          sample = mctx.getImageData(0, 0, mask.width, mask.height).data;
        } catch {
          sample = null;
        }
      }

      dots = [];
      for (let y = SPACING / 2; y < h; y += SPACING) {
        for (let x = SPACING / 2; x < w; x += SPACING) {
          if (sample) {
            const px = Math.floor(x);
            const py = Math.floor(y);
            const alpha = sample[(py * mask.width + px) * 4 + 3];
            // Inside a letter: leave a gap rather than a dot.
            if (alpha > 40) continue;
          }
          dots.push({ x, y, level: 0 });
        }
      }
    }

    function draw() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      let awake = false;
      for (const dot of dots) {
        if (pointer.inside) {
          const d = Math.hypot(dot.x - pointer.x, dot.y - pointer.y);
          const reach = 92;
          if (d < reach) {
            const lift = 1 - d / reach;
            if (lift > dot.level) dot.level = lift;
          }
        }
        if (dot.level > 0.001) {
          // Decay back over about a second. Under reduced motion the decay is
          // immediate, so the field still responds but leaves no wake.
          dot.level = reduced ? 0 : dot.level * 0.945;
          awake = true;
        } else {
          dot.level = 0;
        }

        const alpha = 0.14 + dot.level * 0.66;
        ctx.fillStyle = `rgba(236, 228, 214, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, RADIUS + dot.level * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // The loop stops entirely when no dot is above rest and the pointer has
      // left, and never runs while the canvas is off screen.
      if ((awake || pointer.inside) && onScreen) {
        raf = requestAnimationFrame(draw);
      } else {
        running = false;
      }
    }

    function wake() {
      if (running || !onScreen) return;
      running = true;
      raf = requestAnimationFrame(draw);
    }

    function pointFrom(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.inside = true;
      wake();
    }

    const onMove = (e) => pointFrom(e);
    const onLeave = () => { pointer.inside = false; wake(); };
    // A touch point does the same with no drag.
    const onTouch = (e) => {
      if (e.touches && e.touches.length) {
        pointFrom(e.touches[0]);
      }
    };

    build();
    draw();

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('touchmove', onTouch, { passive: true });
    canvas.addEventListener('touchstart', onTouch, { passive: true });

    const onResize = () => { build(); wake(); };
    window.addEventListener('resize', onResize);

    let observer;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          onScreen = entry.isIntersecting;
          if (onScreen) wake();
        }
      }, { threshold: 0 });
      observer.observe(canvas);
    }

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('touchmove', onTouch);
      canvas.removeEventListener('touchstart', onTouch);
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      class="footer-canvas"
      // It carries no information and is not keyboard operable.
      aria-hidden="true"
    />
  );
}
