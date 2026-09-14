import { useEffect, useRef } from 'preact/hooks';

// One reveal component, one distance, one duration. Readable before it finishes.
export function Reveal({ as: Tag = 'div', children, class: cls = '', ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-resolved');
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-resolved');
          io.unobserve(entry.target);
        }
      }
    }, { threshold: 0.05, rootMargin: '0px 0px -5% 0px' });
    io.observe(el);
    const fallback = setTimeout(() => el.classList.add('is-resolved'), 1200);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, []);
  return <Tag ref={ref} class={`reveal ${cls}`} {...rest}>{children}</Tag>;
}
