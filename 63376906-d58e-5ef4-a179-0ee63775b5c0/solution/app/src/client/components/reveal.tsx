/**
 * One reveal component, one distance, one duration. A heading the reader has
 * already reached is never hidden, and nothing stays hidden if the reader
 * never scrolls.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** Nothing a reveal governs stays hidden if the reader never scrolls to it. */
const RESOLVE_WITHOUT_SCROLL_MS = 1200;

export function Reveal({ children }: { children: ComponentChildren }): JSX.Element {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (node.getBoundingClientRect().top < window.innerHeight) return;

    node.classList.add('reveal--armed', 'reveal--pending');

    const resolve = (): void => {
      node.classList.remove('reveal--pending');
      node.classList.add('reveal--resolved');
      observer.disconnect();
      clearTimeout(unscrolled);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) resolve();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(node);
    const unscrolled = setTimeout(resolve, RESOLVE_WITHOUT_SCROLL_MS);

    return () => {
      observer.disconnect();
      clearTimeout(unscrolled);
    };
  }, []);

  return (
    <div class="reveal" ref={host}>
      {children}
    </div>
  );
}
