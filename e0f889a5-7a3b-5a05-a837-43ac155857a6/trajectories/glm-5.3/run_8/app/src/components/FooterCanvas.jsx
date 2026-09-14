import { useEffect, useRef } from 'preact/hooks';

// A field of dots; the company name reads as the gaps between them, not the dots.
export default function FooterCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return; // no context: the bottom row alone renders, nothing is lost
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let dots = [];
    let w = 0, h = 0, dpr = 1;
    // VELA drawn as blocks: 1 = dot omitted (the letter), 0 = dot present.
    const GLYPHS = {
      V: ['1010', '1010', '1010', '1010', '0101', '0101', '0010'],
      E: ['1111', '1000', '1110', '1000', '1000', '1000', '1111'],
      L: ['1000', '1000', '1000', '1000', '1000', '1000', '1111'],
      A: ['0010', '0101', '0101', '1111', '1010', '1010', '1010'],
    };
    const word = 'VELA';
    const cols = 60, cell = 16, pad = 8;
    const glyphH = 7;

    const layout = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      w = Math.max(320, rect.width);
      dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.style.width = w + 'px';
      const rows = glyphH + 6;
      h = rows * cell + pad * 2;
      canvas.height = h * dpr;
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      const scale = Math.max(1, Math.floor(w / (cols * cell)));
      const gw = word.length * 5 * scale;
      const gx = Math.round((w - gw) / 2);
      const gy = pad;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let omitted = false;
          const inGx = c * cell >= gx - cell && c * cell < gx + gw + cell;
          if (inGx && r >= gy / cell && r < gy / cell + glyphH) {
            const glyphIdx = Math.floor((c * cell - gx) / (5 * scale));
            const g = GLYPHS[word[glyphIdx]] || GLYPHS.V;
            const colInGlyph = Math.floor(((c * cell - gx) % (5 * scale)) / scale);
            const rowInGlyph = r - Math.floor(gy / cell);
            if (g[rowInGlyph] && g[rowInGlyph][colInGlyph] === '1') omitted = true;
          }
          dots.push({ x: c * cell + cell / 2, y: r * cell + cell / 2 + pad, v: 0, rest: omitted ? 0.16 : 0.5 });
        }
      }
    };
    layout();
    const onResize = () => layout();
    window.addEventListener('resize', onResize);

    let pointer = null;
    let raf = null;
    let last = performance.now();
    let anyAwake = false;
    const restDot = (d) => d.rest;

    const step = (now) => {
      const dt = Math.min(100, now - last);
      last = now;
      anyAwake = false;
      for (const d of dots) {
        if (pointer) {
          const dist = Math.hypot(d.x - pointer.x, d.y - pointer.y);
          if (dist < 120) {
            const boost = (1 - dist / 120) * 0.9;
            if (boost > d.v) d.v = boost;
          }
        }
        if (d.v > 0.002) {
          d.v -= reduced ? d.v : (dt / 1000) * 0.85;
          if (d.v < 0) d.v = 0;
        }
        if (d.v > 0.002) anyAwake = true;
      }
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        const a = restDot(d) + d.v * 0.6;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(242,240,234,${Math.min(1, a).toFixed(3)})`;
        ctx.fill();
      }
      if (anyAwake || pointer) raf = requestAnimationFrame(step);
      else raf = null;
    };

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
    };
    const onLeave = () => { pointer = null; if (!raf) { raf = requestAnimationFrame(step); } };

    const visible = () => {
      if (!('IntersectionObserver' in window)) return true;
      return canvas.dataset.visible === '1';
    };
    let io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((entries) => {
        canvas.dataset.visible = entries[0].isIntersecting ? '1' : '0';
      });
      io.observe(canvas);
    } else {
      canvas.dataset.visible = '1';
    }

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onMove);
    // draw once
    raf = requestAnimationFrame(step);

    return () => {
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onMove);
      if (io) io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return <canvas class="footer-canvas" ref={ref} aria-hidden="true"></canvas>;
}
