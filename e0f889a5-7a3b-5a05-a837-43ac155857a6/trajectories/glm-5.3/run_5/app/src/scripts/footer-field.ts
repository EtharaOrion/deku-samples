/**
 * The footer canvas: a field of small dots where the company name is drawn by
 * the gaps between dots rather than by the dots themselves. Dots near the
 * pointer brighten and fall off with distance, then decay back over about a
 * second. The loop stops when nothing is above rest and the pointer has left,
 * and never runs while the canvas is off screen.
 */
type Dot = { x: number; y: number; base: number; lift: number; gap: boolean };

export function initFooterField(root: ParentNode): void {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-footer-canvas]');
  const wrap = canvas?.parentElement ?? null;
  if (!canvas || !wrap) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return; // no drawing context: the bottom row alone renders, nothing is lost

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink-on-dark-muted').trim() || 'hsl(40 12% 72%)';
  let dots: Dot[] = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let pointer: { x: number; y: number } | null = null;
  let running = false;
  let visible = false;
  let lastDraw = 0;

  // The word is spelled by removing dots inside its letter shapes.
  const WORD = 'VELA';
  const COLS_FOR_LETTER = 9;
  const ROWS_FOR_LETTER = 5;
  const GLYPHS: Record<string, string[]> = {
    V: ['10001', '10001', '10001', '01010', '00100'],
    E: ['11111', '10000', '11110', '10000', '11111'],
    L: ['10000', '10000', '10000', '10000', '11111'],
    A: ['00100', '01010', '10001', '11111', '10001'],
  };

  function build(): void {
    const rect = wrap.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const spacing = 14;
    const cols = Math.ceil(width / spacing);
    const rows = Math.ceil(height / spacing);
    const letterBlockWidth = WORD.length * (COLS_FOR_LETTER + 1) - 1;
    const letterStartCol = Math.max(0, Math.floor((cols - letterBlockWidth) / 2));
    const letterStartRow = Math.max(0, Math.floor((rows - ROWS_FOR_LETTER) / 2));

    dots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Is this column inside the word?
        const relCol = c - letterStartCol;
        const letterIndex = Math.floor(relCol / (COLS_FOR_LETTER + 1));
        const inLetterCol = relCol >= 0 && letterIndex < WORD.length && (relCol % (COLS_FOR_LETTER + 1)) < COLS_FOR_LETTER;
        const relRow = r - letterStartRow;
        let gap = false;
        if (inLetterCol && relRow >= 0 && relRow < ROWS_FOR_LETTER) {
          const glyph = GLYPHS[WORD[letterIndex]]!;
          const colInGlyph = relCol % (COLS_FOR_LETTER + 1);
          const rowBits = glyph[relRow]!;
          gap = rowBits[Math.floor((colInGlyph / COLS_FOR_LETTER) * rowBits.length)] === '1';
        }
        dots.push({ x: c * spacing + spacing / 2, y: r * spacing + spacing / 2, base: 0.28, lift: 0, gap });
      }
    }
    draw();
  }

  function draw(): void {
    ctx.clearRect(0, 0, width, height);
    const now = performance.now();
    const dt = Math.min(64, now - lastDraw) / 1000;
    lastDraw = now;
    let anyLift = false;
    let anyRest = false;
    for (const dot of dots) {
      if (pointer) {
        const dx = dot.x - pointer.x;
        const dy = dot.y - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 90) dot.lift = Math.min(1, dot.lift + (1 - dist / 90) * dt * 6);
      }
      const alpha = dot.gap ? 0 : Math.min(1, dot.base + dot.lift);
      if (!dot.gap && dot.base > 0) anyRest = true;
      if (dot.lift > 0.001) anyLift = true;
      if (alpha > 0.01) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.gap ? 0 : 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Decay back over about a second; immediately under reduced motion.
      const decay = reduced.matches ? 1 : Math.min(1, dt * 1.1);
      dot.lift = Math.max(0, dot.lift - decay);
    }
    ctx.globalAlpha = 1;
    // Stop entirely when no dot is above rest and the pointer has left.
    if (anyLift || pointer) {
      requestAnimationFrame(draw);
      running = true;
    } else {
      running = false;
    }
    void anyRest;
  }

  function wake(): void {
    if (!visible || running) return;
    running = true;
    lastDraw = performance.now();
    requestAnimationFrame(draw);
  }

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) wake(); else running = false;
  }, { threshold: 0 });
  io.observe(wrap);

  wrap.addEventListener('pointermove', (e) => {
    const rect = wrap.getBoundingClientRect();
    pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    wake();
  });
  wrap.addEventListener('pointerleave', () => { pointer = null; wake(); });
  wrap.addEventListener('pointerdown', (e) => {
    const rect = wrap.getBoundingClientRect();
    pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    wake();
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(build, 120);
  });

  build();
}

/** A very faint animated speckle so a large dark gradient cannot band. */
export function initSpeckle(root: ParentNode): void {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-speckle]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, dpr = 1, frame = 0, timer = 0, visible = false;

  function build(): void {
    dpr = 1; // speckle needs no device pixels
    width = Math.floor(canvas.clientWidth || window.innerWidth);
    height = Math.floor(canvas.clientHeight || window.innerHeight);
    canvas.width = Math.max(1, Math.floor(width / 2));
    canvas.height = Math.max(1, Math.floor(height / 2));
  }

  function paint(): void {
    const w = canvas.width, h = canvas.height;
    const image = ctx.createImageData(w, h);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      data[i] = v; data[i + 1] = v * 0.96; data[i + 2] = v * 0.9; data[i + 3] = 26;
    }
    ctx.putImageData(image, 0, 0);
  }

  function loop(): void {
    if (!visible || reduced.matches) return;
    frame++;
    paint();
    timer = window.setTimeout(loop, 220);
  }

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible && !reduced.matches) loop();
    else window.clearTimeout(timer);
  }, { threshold: 0 });
  io.observe(canvas);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { build(); paint(); }, 120);
  });

  build();
  paint();
  if (!reduced.matches) loop();
}
