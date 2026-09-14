// One reveal component: one distance, one duration. Nothing stays hidden
// if the reader never scrolls to it.
export function useReveal() {
  if (typeof window === 'undefined') return;
  if (!window.__revealObserver) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.__revealObserver = { observe: (el) => el.classList.add('is-visible'), unobserve: () => {} };
    } else {
      window.__revealObserver = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            window.__revealObserver.unobserve(e.target);
          }
        }
      }, { rootMargin: '0px 0px -10% 0px' });
    }
  }
  return window.__revealObserver;
}
