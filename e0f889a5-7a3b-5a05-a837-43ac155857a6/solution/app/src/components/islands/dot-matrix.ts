import { easeDefault } from "./bezier";

const PITCH = 9;
const DOT_RADIUS = 1;
const REACH = 54;
const DECAY_MS = 1200;
type Rgb = readonly [number, number, number];

export function startMatrix(): void {
  const canvas = document.getElementById("matrix");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.hidden = false;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let cols = 0;
  let rows = 0;
  let width = 0;
  let height = 0;
  let levels = new Float32Array(0);
  let drawn = new Uint8Array(0);
  let pointerX = -1e4;
  let pointerY = -1e4;
  let pointerInside = false;
  let onScreen = true;
  let running = false;
  let last = 0;
  let rest: Rgb = [30, 30, 30];
  let lit: Rgb = [241, 241, 241];

  const tokenRgb = (name: string, fallback: Rgb): Rgb => {
    const probe = document.createElement("span");
    probe.style.color = getComputedStyle(canvas).getPropertyValue(name).trim();
    canvas.parentElement?.append(probe);
    const values = getComputedStyle(probe).color.match(/\d+(?:\.\d+)?/g)?.map(Number);
    probe.remove();
    return values && values.length >= 3
      ? [values[0] ?? fallback[0], values[1] ?? fallback[1], values[2] ?? fallback[2]]
      : fallback;
  };

  const glyphMask = () => {
    const stencil = document.createElement("canvas");
    stencil.width = width;
    stencil.height = height;
    const pen = stencil.getContext("2d");
    if (!pen) return null;
    pen.clearRect(0, 0, width, height);
    pen.fillStyle = "CanvasText";
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    const family = getComputedStyle(document.body).fontFamily;
    let size = Math.min(width * 0.9, height * 1.15);
    pen.font = `700 ${size}px ${family}`;
    while (pen.measureText("vela").width > width * 0.86 && size > 12) {
      size *= 0.94;
      pen.font = `700 ${size}px ${family}`;
    }
    pen.fillText("vela", width / 2, height / 2);
    return pen.getImageData(0, 0, width, height).data;
  };

  const layout = () => {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    context.setTransform(density, 0, 0, density, 0, 0);
    rest = tokenRgb("--matrix-rest", rest);
    lit = tokenRgb("--matrix-lit", lit);

    cols = Math.floor(width / PITCH);
    rows = Math.floor(height / PITCH);
    levels = new Float32Array(cols * rows);
    drawn = new Uint8Array(cols * rows);

    const mask = glyphMask();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = Math.round(col * PITCH + PITCH / 2);
        const y = Math.round(row * PITCH + PITCH / 2);
        const inside = mask ? (mask[(y * width + x) * 4 + 3] ?? 0) > 128 : false;
        drawn[row * cols + col] = inside ? 0 : 1;
      }
    }
    paint();
  };

  const paint = () => {
    const ground = getComputedStyle(canvas).backgroundColor;
    context.clearRect(0, 0, width, height);
    context.fillStyle = ground;
    context.fillRect(0, 0, width, height);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        if (!drawn[index]) continue;
        const shade = easeDefault(levels[index] ?? 0);
        const r = Math.round(rest[0] + (lit[0] - rest[0]) * shade);
        const g = Math.round(rest[1] + (lit[1] - rest[1]) * shade);
        const b = Math.round(rest[2] + (lit[2] - rest[2]) * shade);
        context.fillStyle = `rgb(${r}, ${g}, ${b})`;
        context.beginPath();
        context.arc(col * PITCH + PITCH / 2, row * PITCH + PITCH / 2, DOT_RADIUS, 0, Math.PI * 2);
        context.fill();
      }
    }
  };

  const excite = () => {
    if (!pointerInside) return;
    const reachCells = Math.ceil(REACH / PITCH);
    const centreCol = Math.floor(pointerX / PITCH);
    const centreRow = Math.floor(pointerY / PITCH);
    for (let row = centreRow - reachCells; row <= centreRow + reachCells; row += 1) {
      if (row < 0 || row >= rows) continue;
      for (let col = centreCol - reachCells; col <= centreCol + reachCells; col += 1) {
        if (col < 0 || col >= cols) continue;
        const dx = col * PITCH + PITCH / 2 - pointerX;
        const dy = row * PITCH + PITCH / 2 - pointerY;
        const falloff = 1 - (dx * dx + dy * dy) / (REACH * REACH);
        if (falloff <= 0) continue;
        const index = row * cols + col;
        if ((levels[index] ?? 0) < falloff) levels[index] = falloff;
      }
    }
  };

  const step = (now: number) => {
    const elapsed = Math.min(64, now - last);
    last = now;
    excite();

    if (reduced.matches) {
      // Show the current touch or pointer position for one frame, then retain
      // no wake at all.
      paint();
      levels.fill(0);
      if (pointerInside && onScreen) {
        requestAnimationFrame(step);
      } else {
        running = false;
      }
      return;
    }

    const decay = elapsed / DECAY_MS;
    let alive = false;
    for (let index = 0; index < levels.length; index += 1) {
      const value = levels[index] ?? 0;
      if (value <= 0) continue;
      const next = value - decay;
      levels[index] = next > 0 ? next : 0;
      if ((levels[index] ?? 0) > 0) alive = true;
    }

    paint();

    if ((alive || pointerInside) && onScreen) {
      requestAnimationFrame(step);
      return;
    }
    running = false;
  };

  const wake = () => {
    if (running || !onScreen) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(step);
  };

  const track = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    pointerX = event.clientX - box.left;
    pointerY = event.clientY - box.top;
    pointerInside =
      pointerX >= 0 && pointerY >= 0 && pointerX <= box.width && pointerY <= box.height;
    wake();
  };

  canvas.addEventListener("pointermove", track);
  canvas.addEventListener("pointerdown", track);
  canvas.addEventListener("pointerleave", () => {
    pointerInside = false;
    wake();
  });
  const liftTouch = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    pointerInside = false;
    wake();
  };
  canvas.addEventListener("pointerup", liftTouch);
  canvas.addEventListener("pointercancel", liftTouch);

  window.addEventListener("resize", layout);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) wake();
    }).observe(canvas);
  }

  if (document.fonts?.ready) void document.fonts.ready.then(layout);
  layout();
}
