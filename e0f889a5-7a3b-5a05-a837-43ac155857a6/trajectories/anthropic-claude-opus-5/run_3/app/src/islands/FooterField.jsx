import { useEffect, useRef } from 'preact/hooks';

/**
 * A field of small dots arranged so the company name is drawn by the gaps
 * between them rather than by the dots themselves, which is why it reads as
 * shapes within a field rather than as bright letters.
 *
 * It carries no information and is not keyboard operable. If a drawing context
 * cannot be acquired the footer renders its bottom row alone and nothing is
 * lost.
 */
export default function FooterField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined; // nothing is lost

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let dots = [];
    let raf = 0;
    let running = false;
    let onScreen = false;
    const pointer = { x: -9999, y: -9999, present: false };

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Stamp the wordmark into an offscreen buffer, then keep only the dots
      // that fall outside the letterforms. The name is the gap.
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const octx = off.getContext('2d');
      let mask = null;
      if (octx) {
        octx.fillStyle = '#000';
        octx.fillRect(0, 0, w, h);
        const size = Math.min(h * 0.72, w * 0.26);
        octx.font = `700 ${size}px 'Vela Grotesque', system-ui, sans-serif`;
        octx.textAlign = 'center';
        octx.textBaseline = 'middle';
        octx.fillStyle = '#fff';
        octx.fillText('VELA', w / 2, h / 2);
        mask = octx.getImageData(0, 0, w, h).data;
      }

      const gap = 9;
      const next = [];
      for (let y = gap; y < h - 2; y += gap) {
        for (let x = gap; x < w - 2; x += gap) {
          if (mask) {
            const idx = (Math.floor(y) * w + Math.floor(x)) * 4;
            // Inside a letterform: leave the space empty, so the name reads as
            // the gap in the field.
            if (mask[idx] > 128) continue;
          }
          next.push({ x, y, level: 0 });
        }
      }
      dots = next;
    };

    const draw = () => {
      raf = 0;
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const styles = getComputedStyle(canvas);
      const base = styles.getPropertyValue('--dot-rest').trim() || 'rgba(160,155,146,0.34)';
      const lit = styles.getPropertyValue('--dot-lit').trim() || 'rgba(244,242,236,0.95)';

      let awake = false;
      for (const dot of dots) {
        if (pointer.present) {
          const dx = dot.x - pointer.x;
          const dy = dot.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          // Dots near the pointer brighten and fall off with distance.
          const reach = 120;
          const gain = dist < reach ? (1 - dist / reach) ** 1.6 : 0;
          if (gain > dot.level) dot.level = gain;
        }
        if (dot.level > 0.003) {
          // Decay back over about a second, so dragging leaves a fading wake.
          // Under reduced motion the decay is immediate.
          dot.level = reduced ? 0 : dot.level * 0.955;
          awake = true;
        } else {
          dot.level = 0;
        }

        ctx.fillStyle = dot.level > 0.01 ? mix(base, lit, dot.level) : base;
        const r = 1.15 + dot.level * 1.5;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // The loop stops entirely when no dot is above rest and the pointer has
      // left, and never runs while the canvas is off screen.
      if (onScreen && (awake || pointer.present)) {
        raf = requestAnimationFrame(draw);
        running = true;
      } else {
        running = false;
      }
    };

    const kick = () => {
      if (!running && onScreen && !raf) {
        raf = requestAnimationFrame(draw);
        running = true;
      }
    };

    const move = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const point = ev.touches?.[0] ?? ev;
      pointer.x = point.clientX - rect.left;
      pointer.y = point.clientY - rect.top;
      pointer.present = true;
      kick();
    };
    const leave = () => {
      pointer.present = false;
      pointer.x = -9999;
      pointer.y = -9999;
      kick();
    };

    build();
    draw();

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) kick();
      },
      { threshold: 0.01 },
    );
    io.observe(canvas);

    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('touchmove', move, { passive: true });
    canvas.addEventListener('touchstart', move, { passive: true });
    canvas.addEventListener('touchend', leave);

    const onResize = () => {
      build();
      kick();
    };
    window.addEventListener('resize', onResize);

    return () => {
      io.disconnect();
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchstart', move);
      canvas.removeEventListener('touchend', leave);
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} class="footer__canvas" aria-hidden="true" />;
}

function mix(a, b, t) {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return b;
  const out = pa.map((v, i) => (i < 3 ? Math.round(v + (pb[i] - v) * t) : +(v + (pb[i] - v) * t).toFixed(3)));
  return `rgba(${out[0]},${out[1]},${out[2]},${out[3]})`;
}

function parse(colour) {
  const m = /rgba?\(([^)]+)\)/.exec(colour);
  if (!m) return null;
  const parts = m[1].split(',').map((v) => parseFloat(v.trim()));
  if (parts.length === 3) parts.push(1);
  return parts;
}
