import { useEffect } from 'preact/hooks';

// The scroll driver. The darkening is a pure function of scroll position, so
// stopping halfway leaves it halfway and scrolling back up lifts it in exact
// proportion. It is never removed under reduced motion.
export default function ScrollStage() {
  useEffect(() => {
    const page = document.getElementById('letter-page');
    const stage = document.getElementById('stage');
    const film = document.getElementById('stage-film');
    const still = document.getElementById('stage-still');
    if (!page || !stage) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const wide = window.matchMedia('(min-width: 64rem)');
    const blocks = Array.from(document.querySelectorAll('.letter-block'));

    let frame = 0;
    const paint = () => {
      frame = 0;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const y = Math.min(Math.max(window.scrollY, 0), max);

      // Darkening runs over the first 80% of the scroll, then the flat panel
      // takes the last 20%, so the footer begins against true ground.
      const p = y / max;
      const darken = Math.min(1, p / 0.8);
      const flat = p <= 0.8 ? 0 : Math.min(1, (p - 0.8) / 0.2);
      page.style.setProperty('--darken', darken.toFixed(4));
      page.style.setProperty('--flat', flat.toFixed(4));

      // Below the breakpoint each block fades in and out in step with scroll.
      if (!wide.matches) {
        const mid = window.innerHeight / 2;
        for (const block of blocks) {
          const rect = block.getBoundingClientRect();
          const centre = rect.top + rect.height / 2;
          const distance = Math.abs(centre - mid) / (window.innerHeight * 0.72);
          const opacity = Math.max(0.06, Math.min(1, 1.12 - distance));
          block.style.setProperty('--p', opacity.toFixed(3));
        }
      } else {
        for (const block of blocks) block.style.setProperty('--p', '1');
      }
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // The film is inert and refuses to start under reduced motion or a metered
    // connection, in which case the still frame simply stays.
    let observer = null;
    if (film) {
      const conn = navigator.connection || {};
      const metered = Boolean(conn.saveData) || /(^|-)2g$/.test(String(conn.effectiveType || ''));
      const allowed = !reduced.matches && !metered;

      if (!allowed) {
        film.removeAttribute('src');
      } else {
        let visible = true;
        const settle = () => {
          if (document.hidden || !visible) {
            film.pause();
            return;
          }
          // Never starts before the still frame has painted.
          const ready = !still || still.complete || still.naturalWidth > 0;
          if (!ready) return;
          const started = film.play();
          if (started && typeof started.catch === 'function') started.catch(() => {});
        };

        film.addEventListener('playing', () => {
          film.dataset.playing = 'true';
          if (still) still.dataset.hidden = 'true';
        });
        film.addEventListener('error', () => {
          // If the film fails the still stays, which is a complete rendering.
          film.dataset.playing = 'false';
          if (still) still.dataset.hidden = 'false';
        });

        observer = new IntersectionObserver((entries) => {
          visible = entries.some((e) => e.isIntersecting);
          settle();
        }, { threshold: 0.01 });
        observer.observe(stage);

        document.addEventListener('visibilitychange', settle);
        if (still && !(still.complete || still.naturalWidth > 0)) {
          still.addEventListener('load', settle, { once: true });
          still.addEventListener('error', () => {
            // If the still frame fails too, a generated gradient takes its place.
            still.dataset.failed = 'true';
            settle();
          }, { once: true });
        }
        settle();
      }
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (observer) observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
