import { useEffect } from 'preact/hooks';

// The darkening is a pure function of scroll position: stopping halfway leaves it
// halfway, scrolling back up lifts it in exact proportion. It is never removed
// under reduced motion, because the writing is light and the film is lit.
export default function ScrollDriver() {
  useEffect(() => {
    const root = document.documentElement;
    const letter = document.getElementById('letter');
    const driven = Array.from(document.querySelectorAll('[data-driven-block]'));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const wide = window.matchMedia('(min-width: 64rem)');

    let ticking = false;

    const apply = () => {
      ticking = false;
      const doc = document.documentElement;
      const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
      const y = Math.min(Math.max(window.scrollY, 0), scrollable);
      const p = y / scrollable;
      root.style.setProperty('--scroll-progress', p.toFixed(4));

      // The panel is fully drawn a little before the footer, where a flat panel
      // takes over and removes the film entirely.
      const darken = Math.min(1, p / 0.86);
      root.style.setProperty('--stage-darken', darken.toFixed(4));
      root.style.setProperty('--stage-flat', darken >= 1 ? '1' : '0');

      if (!driven.length) return;
      if (wide.matches || reduced.matches) {
        // On a wide screen the paragraphs do not fade at all; only the picture changes.
        for (const el of driven) el.style.opacity = '0';
        return;
      }
      const vh = window.innerHeight;
      for (const el of driven) {
        const rect = el.getBoundingClientRect();
        const centre = rect.top + rect.height / 2;
        const d = Math.abs(centre - vh / 2) / (vh * 0.62);
        el.style.opacity = String(Math.max(0, Math.min(1, 1 - d)).toFixed(3));
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    if (letter) letter.dataset.driven = 'true';

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return null;
}
