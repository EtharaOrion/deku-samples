import { useEffect, useRef } from 'preact/hooks';

// The film of the workshop table. It is scenery and never information:
// inert, unfocusable, hidden from assistive technology, silent, and it refuses
// to start under reduced motion or on a metered connection. Drawn rather than
// fetched, so there is no third asset to fail.
export default function Film() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return undefined;

    const stage = document.getElementById('stage');
    const still = document.getElementById('still-frame');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = navigator.connection || {};
    const metered = connection.saveData === true || /^(slow-2g|2g)$/.test(connection.effectiveType || '');

    if (reduced.matches || metered) {
      // The still frame simply stays, and that is a complete rendering of the page.
      return undefined;
    }

    let raf = 0;
    let running = false;
    let visible = true;
    let started = false;
    let t = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };

    const grain = (w, h) => {
      // A very faint speckle so a large dark gradient cannot band.
      const g = document.createElement('canvas');
      g.width = 160;
      g.height = 160;
      const gc = g.getContext('2d');
      const img = gc.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 118 + Math.floor(Math.random() * 24);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 10;
      }
      gc.putImageData(img, 0, 0);
      return ctx.createPattern(g, 'repeat');
    };

    let speckle = null;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h) return;
      t += 0.0016;

      // The table: a warm plane lit from one window, the light drifting slowly.
      const cx = w * (0.34 + 0.06 * Math.sin(t * 0.7));
      const cy = h * (0.26 + 0.05 * Math.cos(t * 0.55));
      const base = ctx.createRadialGradient(cx, cy, 0, w * 0.5, h * 0.6, Math.max(w, h) * 0.95);
      base.addColorStop(0, 'hsl(34 42% 44%)');
      base.addColorStop(0.45, 'hsl(28 34% 26%)');
      base.addColorStop(1, 'hsl(26 26% 11%)');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      // Grain of the table top, drifting.
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = 'hsl(30 30% 16%)';
      ctx.lineWidth = Math.max(1, dpr);
      for (let i = 0; i < 26; i += 1) {
        const y = ((i / 26) * h + Math.sin(t * 0.6 + i) * 8) % h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.3, y + Math.sin(t + i) * 14, w * 0.7, y - Math.cos(t + i) * 12, w, y + 6);
        ctx.stroke();
      }
      ctx.restore();

      // Objects on the table, breathing rather than moving: a body, a lens, a mug.
      const objects = [
        { x: 0.24, y: 0.62, rx: 0.13, ry: 0.075, hue: 26, light: 12 },
        { x: 0.62, y: 0.54, rx: 0.09, ry: 0.055, hue: 32, light: 16 },
        { x: 0.82, y: 0.72, rx: 0.05, ry: 0.04, hue: 24, light: 20 },
      ];
      for (let i = 0; i < objects.length; i += 1) {
        const o = objects[i];
        const breathe = 1 + Math.sin(t * 0.9 + i * 1.7) * 0.012;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = `hsl(${o.hue} 22% ${o.light}%)`;
        ctx.beginPath();
        ctx.ellipse(w * o.x, h * o.y, w * o.rx * breathe, h * o.ry * breathe, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Dust in the window light.
      ctx.save();
      ctx.fillStyle = 'hsl(40 60% 82%)';
      for (let i = 0; i < 40; i += 1) {
        const px = ((i * 97.3 + t * 40 * (1 + (i % 3))) % 100) / 100;
        const py = ((i * 53.7 + Math.sin(t + i) * 6) % 100) / 100;
        ctx.globalAlpha = 0.05 + 0.05 * Math.sin(t * 2 + i);
        ctx.fillRect(px * w, py * h, dpr, dpr);
      }
      ctx.restore();

      if (speckle) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = speckle;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      if (!started) {
        started = true;
        // Never before the still frame has painted: dissolve it away now.
        if (still) still.dataset.state = 'gone';
        canvas.dataset.state = 'playing';
      }
    };

    const loop = () => {
      if (!running) return;
      draw();
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    resize();
    speckle = grain();

    const onResize = () => {
      resize();
    };
    window.addEventListener('resize', onResize, { passive: true });

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible && !document.hidden) start();
        else stop();
      },
      { threshold: 0.01 },
    );
    if (stage) io.observe(stage);

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onReduced = () => {
      if (reduced.matches) {
        stop();
        canvas.dataset.state = 'off';
        if (still) still.dataset.state = 'shown';
      } else if (visible) {
        start();
      }
    };
    reduced.addEventListener('change', onReduced);

    // Give the still frame a paint before the film begins.
    const kick = window.setTimeout(() => {
      if (visible && !document.hidden) start();
    }, 120);

    return () => {
      window.clearTimeout(kick);
      stop();
      io.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onReduced);
    };
  }, []);

  return <canvas ref={ref} id="film" class="film" aria-hidden="true" data-state="idle" />;
}
