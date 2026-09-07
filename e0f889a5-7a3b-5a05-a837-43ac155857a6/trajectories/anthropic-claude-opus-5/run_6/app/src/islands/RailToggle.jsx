import { useEffect, useState } from 'preact/hooks';

// On a narrow viewport the rail collapses to one control above the content column.
export default function RailToggle() {
  const [narrow, setNarrow] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 63.999rem)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const nav = document.getElementById('rail-nav');
    if (!nav) return;
    nav.dataset.collapsed = narrow && !open ? 'true' : 'false';
  }, [narrow, open]);

  if (!narrow) return null;

  return (
    <button
      type="button"
      class="btn secondary rail-toggle"
      aria-expanded={open ? 'true' : 'false'}
      aria-controls="rail-nav"
      onClick={() => setOpen((v) => !v)}
    >
      {open ? 'Hide sections' : 'Sections'}
    </button>
  );
}
