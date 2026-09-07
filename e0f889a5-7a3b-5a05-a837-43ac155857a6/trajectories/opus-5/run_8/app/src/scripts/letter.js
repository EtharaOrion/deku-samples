// The scroll driver for the letter.
//
// Two properties are requirements rather than taste. The darkening is a pure
// function of scroll position, so stopping halfway leaves it halfway and
// scrolling back up lifts it in exact proportion. And it is never removed under
// reduced motion, because the writing is light and the film is lit.

const stage = document.querySelector('.stage');
const page = document.querySelector('.letter-page');
if (stage && page) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const wide = window.matchMedia('(min-width: 64rem)');
  const driven = document.querySelector('.letter-driven');
  const blocks = driven ? Array.from(driven.querySelectorAll('.block')) : [];

  // The driven layer exists in the markup already and is inert. Turning it on
  // hides the flow copy visually only; the flow copy remains the source.
  if (blocks.length) page.classList.add('js-driven');

  let ticking = false;

  function progress() {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    return Math.min(1, Math.max(0, window.scrollY / max));
  }

  function apply() {
    ticking = false;
    const p = progress();

    // The gradient panel darkens the whole stage from the bottom upward.
    // Fully drawn by 80% of the scroll; the flat panel then removes the film.
    const darken = Math.min(1, p / 0.8);
    const flat = Math.min(1, Math.max(0, (p - 0.86) / 0.1));
    stage.style.setProperty('--darken', darken.toFixed(4));
    stage.style.setProperty('--flat', flat.toFixed(4));

    // On a wide screen the paragraphs do not fade at all; only the picture
    // behind them changes.
    if (!blocks.length) return;
    if (wide.matches) {
      for (const b of blocks) b.style.setProperty('--o', '1');
      return;
    }
    const vh = window.innerHeight;
    for (const b of blocks) {
      const r = b.getBoundingClientRect();
      const centre = r.top + r.height / 2;
      // In exact step with the scroll: fully lit in the middle band, out at the edges.
      const d = Math.abs(centre - vh / 2) / (vh * 0.62);
      const o = Math.min(1, Math.max(0.06, 1 - d * d));
      b.style.setProperty('--o', o.toFixed(3));
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(apply);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  wide.addEventListener('change', onScroll);
  apply();

  /* --------------------------------------------------------------- the film */

  const video = stage.querySelector('.stage-video');
  const still = stage.querySelector('.stage-still');

  if (video && still) {
    const conn = navigator.connection;
    const metered = !!(conn && (conn.saveData || /^(slow-2g|2g|3g)$/.test(conn.effectiveType || '')));

    // It refuses to start at all under reduced motion or a metered connection,
    // in which case the still frame simply stays, and that is a complete
    // rendering of the page.
    if (reduced.matches || metered) {
      video.remove();
    } else {
      let inView = true;

      const settle = () => {
        // It never starts before the still frame has painted.
        if (!still.complete && still.dataset.failed !== '1') return;
        video.play().then(() => {
          still.classList.add('is-gone');
        }).catch(() => {
          // Autoplay refused: the still stays and nothing is lost.
        });
      };

      // Never plays before there is enough footage to play.
      video.addEventListener('canplaythrough', settle, { once: true });
      video.addEventListener('error', () => { video.remove(); }, { once: true });

      // Pauses when the document is hidden and when the stage leaves the viewport.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) video.pause();
        else if (inView) video.play().catch(() => {});
      });

      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            inView = e.isIntersecting;
            if (!inView) video.pause();
            else if (!document.hidden) video.play().catch(() => {});
          }
        }, { threshold: 0 });
        io.observe(stage);
      }

      if (still.complete) settle();
      else still.addEventListener('load', settle, { once: true });
    }
  }

  // If the still frame fails too, a generated gradient keyed to the letter's own
  // colours takes its place.
  if (still) {
    still.addEventListener('error', () => {
      still.dataset.failed = '1';
      still.style.display = 'none';
    }, { once: true });
  }
}
