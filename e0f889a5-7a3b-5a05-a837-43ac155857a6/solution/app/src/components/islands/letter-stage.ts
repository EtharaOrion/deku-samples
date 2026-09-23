import { clamp01, easeDefault, ramp } from "./bezier";

const POSTER_WIDE = "/film/first-frame-desktop.jpg";
const POSTER_NARROW = "/film/first-frame-mobile.jpg";
const FILM_WEBM = "/film/table.webm";
const FILM_MP4 = "/film/table.mp4";
const RETREAT: Ramp = { start: 0.87, end: 1 };

type Ramp = { start: number; end: number };

const SCRIM_WIDE: Ramp = { start: 0.19, end: 0.68 };
const SCRIM_NARROW: Ramp = { start: 0.27, end: 0.6 };
const FLOOD: Ramp = { start: 0.7, end: 0.86 };
const DRIVEN_PEAK = 0.12;

export function startStage(): void {
  const stage = document.getElementById("stage");
  const film = document.getElementById("film");
  if (!(stage instanceof HTMLElement) || !(film instanceof HTMLVideoElement)) return;
  const stageElement = stage;
  const filmElement = film;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const wide = window.matchMedia("(min-width: 64rem)");
  const head = document.querySelector<HTMLElement>(".letter__head");
  const paragraphs = Array.from(document.querySelectorAll<HTMLElement>(".writing__p"));
  const drivenBlocks = Array.from(document.querySelectorAll<HTMLElement>(".driven__block"));

  let stageTop = 0;
  let stageRange = 1;
  let queued = false;
  let onScreen = true;
  let flooded = false;
  let drag: { pointerId: number; y: number } | null = null;

  const writing = document.querySelector<HTMLElement>(".writing");

  const measure = () => {
    stageTop = stageElement.getBoundingClientRect().top + window.scrollY;
    stageRange = Math.max(1, stageElement.offsetHeight - window.innerHeight);
    if (wide.matches || !writing) return;
    drivenBlocks.forEach((block, index) => {
      const paragraph = paragraphs[index - 2];
      if (!paragraph) return;
      block.style.top = `${writing.offsetTop + paragraph.offsetTop}px`;
      block.style.left = `${paragraph.offsetLeft}px`;
      block.style.right = "auto";
    });
  };

  const scrub = (rect: DOMRect, viewport: number) => {
    const top = rect.top / viewport;
    const bottom = (rect.top + rect.height) / viewport;
    return Math.min(clamp01((0.94 - top) / 0.3), clamp01((bottom + 0.04) / 0.26));
  };

  const draw = () => {
    queued = false;
    const viewport = window.innerHeight;
    const progress = clamp01((window.scrollY - stageTop) / stageRange);
    const band = wide.matches ? SCRIM_WIDE : SCRIM_NARROW;

    stageElement.style.setProperty("--scrim", ramp(progress, band.start, band.end).toFixed(4));
    const flood = ramp(progress, FLOOD.start, FLOOD.end);
    stageElement.style.setProperty("--flood", flood.toFixed(4));

    const nowFlooded = flood > 0.98;
    if (nowFlooded !== flooded) {
      flooded = nowFlooded;
      stageElement.toggleAttribute("data-flooded", flooded);
      syncPlayback();
    }

    // The fixed mark retreats by its own height across the last thirteen
    // percent of the scrollable document, measured against the whole page
    // rather than a pixel offset, so it clears as the footer's mark arrives.
    if (head) {
      const scrollable = Math.max(1, document.documentElement.scrollHeight - viewport);
      const retreat = reduced.matches
        ? 0
        : easeDefault(ramp(clamp01(window.scrollY / scrollable), RETREAT.start, RETREAT.end));
      head.style.setProperty("--retreat", retreat.toFixed(4));
    }

    drivenBlocks.forEach((block, index) => {
      block.style.opacity =
        index < 2 ? "0" : (scrub(block.getBoundingClientRect(), viewport) * DRIVEN_PEAK).toFixed(3);
    });

    if (reduced.matches || wide.matches) {
      for (const paragraph of paragraphs) paragraph.style.removeProperty("--reveal");
      return;
    }
    for (const paragraph of paragraphs) {
      paragraph.style.setProperty(
        "--reveal",
        scrub(paragraph.getBoundingClientRect(), viewport).toFixed(3),
      );
    }
  };

  const request = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(draw);
  };

  function syncPlayback(): void {
    if (stageElement.dataset.film !== "playing") return;
    if (document.hidden || !onScreen || flooded || reduced.matches) {
      filmElement.pause();
      return;
    }
    void filmElement.play().catch(() => undefined);
  }

  const posterPainted = new Promise<boolean>((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve(true);
    probe.onerror = () => resolve(false);
    probe.src = wide.matches ? POSTER_WIDE : POSTER_NARROW;
  });

  const metered = () => {
    const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
    return connection?.saveData === true;
  };

  const startFilm = async () => {
    if (reduced.matches || metered() || stageElement.dataset.film === "playing") return;
    await posterPainted;
    if (reduced.matches) return;
    // Let the poster or its generated gradient reach a painted frame before
    // the media request can replace it.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    filmElement.addEventListener(
      "canplaythrough",
      () => {
        stageElement.dataset.film = "playing";
        syncPlayback();
      },
      { once: true },
    );
    filmElement.addEventListener("error", () => {
      stageElement.dataset.film = "poster";
    });
    filmElement.src = filmElement.canPlayType('video/webm; codecs="vp9"') ? FILM_WEBM : FILM_MP4;
    filmElement.load();
  };

  measure();
  draw();

  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", () => {
    measure();
    request();
  });
  document.addEventListener("visibilitychange", syncPlayback);
  stageElement.addEventListener("pointerdown", (event) => {
    // Blank areas of the inert film resolve to the stage itself. Dragging
    // there moves the document without turning the scenery into a control.
    if (event.pointerType !== "mouse" || event.button !== 0 || event.target !== stageElement) return;
    drag = { pointerId: event.pointerId, y: event.clientY };
    stageElement.setPointerCapture(event.pointerId);
  });
  stageElement.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = drag.y - event.clientY;
    drag.y = event.clientY;
    window.scrollBy(0, distance);
    event.preventDefault();
  });
  const stopDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    if (stageElement.hasPointerCapture(event.pointerId)) {
      stageElement.releasePointerCapture(event.pointerId);
    }
  };
  stageElement.addEventListener("pointerup", stopDrag);
  stageElement.addEventListener("pointercancel", stopDrag);
  wide.addEventListener("change", () => {
    measure();
    request();
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) {
      filmElement.pause();
      stageElement.dataset.film = "pending";
    } else {
      void startFilm();
    }
    request();
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        syncPlayback();
      },
      { rootMargin: "0px" },
    ).observe(stageElement);
  }

  void startFilm();
}
