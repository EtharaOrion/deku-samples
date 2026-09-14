/**
 * The front page driver. The darkening is a pure function of scroll position,
 * never a timed fade. The film is scenery and never information.
 */
export function initLetter() {
  const stage = document.querySelector('[data-letter-stage]');
  const film = document.querySelector('[data-film]');
  const still = document.querySelector('[data-still]');
  const darken = document.querySelector('[data-darken]');
  const copy = document.querySelector('.letter-copy');
  const footer = document.querySelector('[data-footer]');
  const canvas = document.querySelector('[data-footer-canvas]');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let rafPending = false;

  // The gradient that takes over if the still frame fails.
  if (stage) stage.style.background = 'linear-gradient(160deg, hsl(220 14% 10%), hsl(28 22% 14%) 45%, hsl(220 14% 9%))';

  /** Darkening runs at every rung, including reduced motion. */
  function applyDarken() {
    if (!darken || !copy) return;
    const start = copy.offsetTop - 80;
    const end = copy.offsetTop + copy.offsetHeight - window.innerHeight;
    const p = Math.min(1, Math.max(0, (window.scrollY - start) / Math.max(1, end - start)));
    darken.style.setProperty('--darken', String(p));
    if (p >= 1 && footer) {
      footer.classList.add('on-flat');
    } else if (footer) {
      footer.classList.remove('on-flat');
    }
  }

  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      applyDarken();
    });
  }

  applyDarken();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  // The film never starts under reduced motion or a metered connection.
  function canPlay() {
    if (reduced.matches) return false;
    const conn = navigator.connection;
    if (conn && (conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType || ''))) return false;
    return true;
  }

  function tryFilm() {
    if (!film || !still || !canPlay()) return;
    if (typeof film.play !== 'function') return;
    // The still frame is already painted; the film loads only when it can play.
    film.src = '/film/table.mp4';
    film.addEventListener(
      'canplaythrough',
      () => {
        still.style.opacity = '0';
        film.play().catch(() => {});
      },
      { once: true }
    );
    film.addEventListener('error', () => {
      // The still frame stays. That is a complete rendering.
      film.removeAttribute('src');
    }, { once: true });
  }

  // Pause when hidden or off screen.
  document.addEventListener('visibilitychange', () => {
    if (!film) return;
    if (document.hidden) film.pause();
    else if (canPlay() && film.src) film.play().catch(() => {});
  });

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === stage) {
        if (entry.isIntersecting && canPlay() && film && film.src) film.play().catch(() => {});
        else if (film) film.pause();
      }
    }
  });
  if (stage) io.observe(stage);

  tryFilm();
  if (canvas) initFooterCanvas(canvas, reduced);
}

/** Dot field whose gaps draw the company name. Pointer brightens, decay leaves a wake. */
function initFooterCanvas(canvas, reducedQuery) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const parent = canvas.parentElement;
  let dots = [];
  let width = 0;
  let height = 0;
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  let running = false;
  let pointer = null;
  let lastFrame = 0;

  // The word "vela" as a grid of cells that stay dark.
  const WORD = ['01111', '10001', '10000', '10000', '10000', '10000'];

  function build() {
    const rect = parent.getBoundingClientRect();
    width = Math.floor(rect.width);
    height = 200;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const step = 12;
    dots = [];
    const wordW = WORD[0].length * step;
    const wordH = WORD.length * step;
    const originX = Math.floor((width - wordW) / 2 / step) * step;
    const originY = Math.floor((height - wordH) / 2 / step) * step;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const row = Math.floor((y - originY) / step);
        const col = Math.floor((x - originX) / step);
        const inWord = row >= 0 && row < WORD.length && col >= 0 && col < WORD[0].length;
        const isGap = inWord && WORD[row][col] === '1';
        dots.push({ x, y, heat: 0, rest: isGap ? 0.16 : 0.5 });
      }
    }
  }

  function paint(now) {
    if (!running) return;
    const dt = Math.min(64, now - lastFrame || 16);
    lastFrame = now;
    ctx.clearRect(0, 0, width, height);
    const decay = reducedQuery.matches ? 1 : 0.06 * (dt / 16.67);
    let anyHot = false;
    for (const d of dots) {
      if (pointer) {
        const dx = d.x - pointer.x;
        const dy = d.y - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 90) d.heat = Math.min(1, d.heat + (1 - dist / 90) * 0.5);
      }
      if (d.heat > 0) {
        d.heat = Math.max(0, d.heat - decay);
        if (d.heat > 0.001) anyHot = true;
      }
    }
    for (const d of dots) {
      const a = d.rest + d.heat * 0.7;
      ctx.fillStyle = `hsl(40 20% ${Math.round(4 + a * 34)}% / ${0.5 + a * 0.5})`;
      ctx.fillRect(d.x, d.y, 2, 2);
    }
    if (anyHot || pointer) requestAnimationFrame(paint);
    else running = false;
  }

  function start() {
    if (running) return;
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(paint);
  }

  build();
  window.addEventListener('resize', build);

  parent.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    start();
  });
  parent.addEventListener('pointerleave', () => {
    pointer = null;
    start();
  });
  parent.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    start();
  });
}
