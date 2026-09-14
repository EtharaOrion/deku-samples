import { useEffect, useRef, useState } from 'preact/hooks';

// One reveal component: one distance, one duration, readable before it finishes,
// and nothing stays hidden if the reader never scrolls.
export function Reveal({ as: Tag = 'div', children, ...rest }: any) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setSeen(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref as any} class={'reveal' + (seen ? ' seen' : '')} {...rest}>
      {children}
    </Tag>
  );
}
