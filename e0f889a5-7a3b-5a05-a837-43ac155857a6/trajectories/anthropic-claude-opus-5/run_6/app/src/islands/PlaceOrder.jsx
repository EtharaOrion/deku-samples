import { useEffect, useRef, useState } from 'preact/hooks';

// One control to place the order. The work happens on the server; this island
// only states that it is happening and stops a second submit from this page.
export default function PlaceOrder({ label }) {
  const [placing, setPlacing] = useState(false);
  const ref = useRef(null);
  const placingRef = useRef(false);

  useEffect(() => {
    const form = ref.current && ref.current.closest('form');
    if (!form) return undefined;
    const onSubmit = (event) => {
      if (placingRef.current) {
        event.preventDefault();
        return;
      }
      placingRef.current = true;
      setPlacing(true);
    };
    form.addEventListener('submit', onSubmit);
    return () => form.removeEventListener('submit', onSubmit);
  }, []);

  return (
    <div class="stack" style="gap:calc(var(--unit) * 2)" ref={ref}>
      <button class="btn" type="submit" data-test="place-order" aria-busy={placing ? 'true' : 'false'}>
        {placing ? 'Placing your order' : label}
      </button>
      <p class="hint" aria-live="polite">{placing ? 'Placing your order. Do not reload this page.' : ''}</p>
    </div>
  );
}
