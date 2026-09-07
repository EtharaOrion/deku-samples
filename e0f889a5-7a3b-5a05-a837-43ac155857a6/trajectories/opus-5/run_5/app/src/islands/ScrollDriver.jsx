import { useEffect } from 'preact/hooks';

/**
 * The scroll driver.
 *
 * Two properties are requirements rather than taste. The darkening is a pure
 * function of scroll position, so stopping halfway leaves it halfway and
 * scrolling back up lifts it in exact proportion. And it is never removed under
 * reduced motion, because the writing is light and the film is lit.
 *
 * The film is inert: no controls, not focusable, hidden from assistive
 * technology. It never starts before the still frame has painted, never plays
 * with sound, pauses when the document is hidden and when the stage leaves the
 * viewport, and refuses to start at all under reduced motion or a metered
 * connection.
 */
export default function ScrollDriver() {
  useEffect(() => {
    const letter = document.querySelector('[data-letter]');
    const stage = document.querySelector('[data-stage]');
    const video = document.querySelector('[data-film]');
    const blocks = Array.from(document.querySelectorAll('[data-block]'));
    if (!letter) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const wide = window.matchMedia('(min-width: 64rem)');

    let frame = 0;

    const drive = () => {
      frame = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const y = window.scrollY || window.pageYOffset || 0;
      const progress = Math.min(1, Math.max(0, y / max));

      // The gradient is drawn from the bottom upward in exact proportion, and
      // is fully drawn a little before the end so the flat panel can take over.
      const darken = Math.min(1, progress / 0.82);
      letter.style.setProperty('--darken', darken.toFixed(4));

      // Once the darkening is full the flat panel removes the film entirely.
      const flatten = progress <= 0.82 ? 0 : Math.min(1, (progress - 0.82) / 0.10);
      letter.style.setProperty('--flatten', flatten.toFixed(4));

      // Below the tier each block fades in and out in exact step with the scroll.
      if (!wide.matches) {
        const viewport = window.innerHeight;
        for (const block of blocks) {
          const rect = block.getBoundingClientRect();
          const centre = rect.top + rect.height / 2;
          const distance = Math.abs(centre - viewport / 2);
          const span = viewport * 0.62;
          const opacity = Math.min(1, Math.max(0.06, 1 - distance / span));
          block.style.setProperty('--block-opacity', opacity.toFixed(3));
        }
      } else {
        for (const block of blocks) block.style.removeProperty('--block-opacity');
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(drive);
    };

    drive();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // ------------------------------------------------------------ the film
    let observer = null;
    let inView = true;

    const metered =
      navigator.connection?.saveData === true ||
      /^(slow-2g|2g|3g)$/.test(navigator.connection?.effectiveType ?? '');

    const mayPlay = () => !reduced.matches && !metered;

    const settle = () => {
      if (!video) return;
      if (!mayPlay()) {
        video.pause();
        return;
      }
      if (inView && !document.hidden) {
        const attempt = video.play();
        if (attempt?.catch) attempt.catch(() => { /* the still frame stays */ });
      } else {
        video.pause();
      }
    };

    if (video && mayPlay()) {
      // It never starts before the still frame has painted.
      const start = () => {
        stage?.setAttribute('data-film', 'playing');
        settle();
      };
      if (video.readyState >= 3) start();
      else video.addEventListener('canplay', start, { once: true });
      video.addEventListener('error', () => {
        // The still frame simply stays, and that is a complete rendering.
        stage?.removeAttribute('data-film');
      });

      observer = new IntersectionObserver(
        (entries) => {
          inView = entries.some((e) => e.isIntersecting);
          settle();
        },
        { threshold: 0.01 },
      );
      if (stage) observer.observe(stage);

      document.addEventListener('visibilitychange', settle);
    }

    const onMotionChange = () => {
      if (!video) return;
      if (reduced.matches) {
        video.pause();
        stage?.removeAttribute('data-film');
      } else {
        settle();
      }
      drive();
    };
    reduced.addEventListener('change', onMotionChange);
    wide.addEventListener('change', drive);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('visibilitychange', settle);
      reduced.removeEventListener('change', onMotionChange);
      wide.removeEventListener('change', drive);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
