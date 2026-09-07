import { useEffect } from 'preact/hooks';

/**
 * The scroll driver.
 *
 * The darkening is a pure function of scroll position: stopping halfway leaves
 * it halfway and scrolling back up lifts it in exact proportion. It is never a
 * fade that plays once on a timer, and it is never removed under reduced
 * motion, because the writing is light and the film is lit.
 *
 * On a narrow viewport it also drives the inert copy of each paragraph, which
 * fades in and out in exact step with the scroll. That layer is never the only
 * copy: the normal-flow paragraphs are what the markup carries.
 */
export default function ScrollDriver() {
  useEffect(() => {
    const stage = document.querySelector('[data-stage]');
    const darken = document.querySelector('[data-darken]');
    const flat = document.querySelector('[data-flat]');
    const driven = Array.from(document.querySelectorAll('[data-driven-para]'));
    if (!stage) return undefined;

    const wide = window.matchMedia('(min-width: 64rem)');
    let ticking = false;

    const apply = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const y = window.scrollY || doc.scrollTop || 0;

      // The darkening completes over the first three quarters of the document,
      // in exact proportion, so the footer meets true ground.
      const progress = Math.min(1, Math.max(0, y / max));
      const shade = Math.min(1, progress / 0.75);
      if (darken) darken.style.setProperty('--darken', shade.toFixed(4));
      // Once the darkening is fully drawn, a flat panel removes the film.
      if (flat) {
        const flatness = Math.min(1, Math.max(0, (progress - 0.72) / 0.18));
        flat.style.setProperty('--flat', flatness.toFixed(4));
      }

      // Below 64rem each block fades in and out in step with the scroll. On a
      // wide screen the letter is a narrow column and does not fade at all.
      if (!wide.matches) {
        const h = window.innerHeight;
        for (const node of driven) {
          const rect = node.getBoundingClientRect();
          const centre = rect.top + rect.height / 2;
          const distance = Math.abs(centre - h / 2) / (h / 2);
          const opacity = Math.min(1, Math.max(0, 1.35 - distance * 1.35));
          node.style.opacity = opacity.toFixed(3);
        }
      } else {
        for (const node of driven) node.style.opacity = '';
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
    wide.addEventListener?.('change', apply);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      wide.removeEventListener?.('change', apply);
    };
  }, []);

  return null;
}
