import { useEffect } from 'preact/hooks';

/**
 * The scroll driver. The darkening is a pure function of scroll position, so
 * stopping halfway leaves it halfway and scrolling back up lifts it in exact
 * proportion. It is never a fade that plays once on a timer, and it is never
 * removed under reduced motion.
 */
export default function LetterStage() {
  useEffect(() => {
    const page = document.querySelector('[data-letter-page]');
    const stage = document.querySelector('[data-stage]');
    const video = document.querySelector('[data-film]');
    if (!page || !stage) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const narrow = window.matchMedia('(max-width: 63.999rem)');

    // The driven layer only exists where paragraphs fade: below the breakpoint.
    const driven = page.querySelector('[data-driven-layer]');
    const drivenParas = driven ? Array.from(driven.querySelectorAll('p')) : [];

    let ticking = false;

    const paint = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / max));

      // Darkening is drawn over the first three quarters of the scroll.
      const darken = Math.min(1, progress / 0.75);
      stage.style.setProperty('--darken', String(darken));
      // Once it is fully drawn, the flat panel removes the film entirely.
      const flat = darken >= 1 ? Math.min(1, (progress - 0.75) / 0.14) : 0;
      stage.style.setProperty('--flat', String(flat));

      if (narrow.matches && drivenParas.length) {
        const vh = window.innerHeight;
        for (const p of drivenParas) {
          const r = p.getBoundingClientRect();
          const centre = r.top + r.height / 2;
          // In exact step with the scroll: distance from the middle of the view.
          const d = Math.abs(centre - vh / 2) / (vh * 0.62);
          p.style.setProperty('--p-opacity', String(Math.min(1, Math.max(0.06, 1 - d))));
        }
      }
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(paint);
      }
    };

    // The driven layer is only used where it does something.
    const syncDriven = () => {
      page.setAttribute('data-driven', narrow.matches ? 'true' : 'false');
      paint();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', syncDriven);
    narrow.addEventListener?.('change', syncDriven);
    syncDriven();

    // The film never starts before the still has painted, never plays with sound,
    // pauses when the document is hidden or the stage leaves the viewport, and
    // refuses to start under reduced motion or a metered connection.
    let observer = null;
    if (video) {
      const conn = navigator.connection || {};
      const metered = Boolean(conn.saveData) || /^([23]g|slow-2g)$/.test(String(conn.effectiveType || ''));
      const allowed = () => !reduced.matches && !metered;

      const tryPlay = () => {
        if (!allowed()) return;
        video.play().then(() => stage.setAttribute('data-playing', 'true')).catch(() => {
          // The still simply stays, which is a complete rendering of the page.
        });
      };

      if (allowed()) {
        // Only once there is enough footage to play.
        if (video.readyState >= 3) tryPlay();
        else video.addEventListener('canplaythrough', tryPlay, { once: true });

        video.addEventListener('error', () => {
          stage.setAttribute('data-film-failed', 'true');
        });

        document.addEventListener('visibilitychange', () => {
          if (document.hidden) video.pause();
          else if (stage.getAttribute('data-visible') !== 'false') tryPlay();
        });

        observer = new IntersectionObserver(
          ([entry]) => {
            stage.setAttribute('data-visible', entry.isIntersecting ? 'true' : 'false');
            if (!entry.isIntersecting) video.pause();
            else if (!document.hidden) tryPlay();
          },
          { threshold: 0.01 },
        );
        observer.observe(stage);
      }
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', syncDriven);
      observer?.disconnect();
    };
  }, []);

  return null;
}
