import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
export function Reveal({ as: As = 'h2', children, class: cls = '', ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.add('is-in'); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { el.classList.add('is-in'); io.disconnect(); }
    }, { threshold: 0.05 });
    io.observe(el);
    const t = setTimeout(() => el.classList.add('is-in'), 900); // never stays hidden
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return h(As, { ref, class: `reveal ${cls}`, ...rest }, children);
}
