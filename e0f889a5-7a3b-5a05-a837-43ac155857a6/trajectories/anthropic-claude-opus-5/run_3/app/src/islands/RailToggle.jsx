import { useEffect, useState } from 'preact/hooks';

/**
 * Below the breakpoint the rail collapses to one control at the top of the
 * content column, which is the only place in the product where a control
 * replaces navigation.
 */
export default function RailToggle() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const rail = document.getElementById('rail');
    if (!rail) return;
    rail.classList.toggle('is-open', open);
  }, [open]);

  return (
    <button
      type="button"
      class="rail-toggle"
      aria-expanded={open ? 'true' : 'false'}
      aria-controls="rail"
      onClick={() => setOpen((v) => !v)}
    >
      <span aria-hidden="true">{open ? '\u2715' : '\u2261'}</span>
      <span>{open ? 'Close sections' : 'Sections'}</span>
    </button>
  );
}
