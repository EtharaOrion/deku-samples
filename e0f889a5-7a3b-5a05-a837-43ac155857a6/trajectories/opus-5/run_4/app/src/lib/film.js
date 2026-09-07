/**
 * The film of the workshop table.
 *
 * It is generated in the browser from the letter's own palette rather than
 * fetched, so the page ships no third-party footage, needs no object store and
 * makes no outbound request. A canvas paints a slow continuous pass of light
 * across a dark table with the grain of the wood and the edge of a jig, and its
 * stream is handed to the video element, which keeps every guarantee the stage
 * already makes of it: muted, looping, inert and pausable.
 */
export function attachGeneratedFilm(video) {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Fixed grain, so the table looks like one surface rather than static.
  const grain = [];
  for (let i = 0; i < 900; i += 1) {
    grain.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      len: 12 + Math.random() * 90,
      a: 0.012 + Math.random() * 0.05,
      w: Math.random() < 0.15 ? 1.6 : 0.7,
    });
  }
  // A few objects on the table, described only as shapes.
  const objects = [
    { x: 0.16, y: 0.62, w: 0.20, h: 0.10, r: 10 },
    { x: 0.55, y: 0.30, w: 0.26, h: 0.07, r: 6 },
    { x: 0.70, y: 0.66, w: 0.13, h: 0.13, r: 14 },
  ];

  let t = 0;
  let raf = 0;

  function frame() {
    t += 0.0016;

    const g = ctx.createLinearGradient(0, 0, canvas.width * 0.4, canvas.height);
    g.addColorStop(0, '#3a3025');
    g.addColorStop(0.55, '#241d16');
    g.addColorStop(1, '#171210');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // One continuous pass of light travelling across the table.
    const cx = canvas.width * (0.5 + 0.42 * Math.sin(t));
    const cy = canvas.height * (0.34 + 0.16 * Math.sin(t * 0.7 + 1.1));
    const lamp = ctx.createRadialGradient(cx, cy, 0, cx, cy, canvas.width * 0.62);
    lamp.addColorStop(0, 'rgba(255, 206, 140, 0.30)');
    lamp.addColorStop(0.35, 'rgba(226, 158, 88, 0.13)');
    lamp.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.lineCap = 'round';
    for (const s of grain) {
      const d = Math.hypot(s.x - cx, s.y - cy) / canvas.width;
      const lit = Math.max(0, 1 - d * 1.5);
      ctx.strokeStyle = `rgba(224, 188, 140, ${(s.a * (0.35 + lit)).toFixed(4)})`;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + s.len, s.y + 0.5);
      ctx.stroke();
    }
    ctx.restore();

    for (const o of objects) {
      const x = o.x * canvas.width;
      const y = o.y * canvas.height;
      const w = o.w * canvas.width;
      const h = o.h * canvas.height;
      const d = Math.hypot(x + w / 2 - cx, y + h / 2 - cy) / canvas.width;
      const lit = Math.max(0.05, 0.5 - d);
      ctx.fillStyle = `rgba(28, 22, 18, 0.75)`;
      roundRect(ctx, x + 5, y + 6, w, h, o.r);
      ctx.fill();
      ctx.fillStyle = `rgba(${Math.round(120 + lit * 150)}, ${Math.round(104 + lit * 120)}, ${Math.round(92 + lit * 90)}, 0.72)`;
      roundRect(ctx, x, y, w, h, o.r);
      ctx.fill();
    }

    // A slow vignette so the writing above stays readable at every width.
    const v = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.25,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    raf = requestAnimationFrame(frame);
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  frame();

  if (typeof canvas.captureStream !== 'function') {
    cancelAnimationFrame(raf);
    return null;
  }

  const stream = canvas.captureStream(24);
  video.srcObject = stream;
  video.muted = true;
  video.play().then(() => {
    video.classList.add('playing');
    document.querySelector('[data-still]')?.classList.add('gone');
  }).catch(() => {
    cancelAnimationFrame(raf);
  });

  // The stage pauses the element when the document is hidden or the stage
  // leaves the viewport; stop painting then too rather than burning a core.
  video.addEventListener('pause', () => cancelAnimationFrame(raf));
  video.addEventListener('play', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  });

  return { canvas, stream };
}
