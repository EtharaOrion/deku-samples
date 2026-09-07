import { useState } from 'preact/hooks';

/**
 * One control to place the order.
 *
 * The idempotency key is fixed when the step renders, so a double submit, a
 * double click or an impatient reader produces one order, one invoice and one
 * mail.
 */
export default function PlaceOrder({ idempotencyKey }) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  async function place() {
    if (state === 'working') return;
    setState('working');
    setError(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      });
      const body = await res.json();

      if (!res.ok) {
        // A line that changed since the cart was last shown returns the person
        // to a re-priced cart carrying that notice.
        if (body.code === 'price_changed' || body.code === 'line_unavailable') {
          window.location.assign('/cart');
          return;
        }
        setState('error');
        setError(body.message || 'That did not work.');
        return;
      }

      const token = body.access_token ? `?access_token=${encodeURIComponent(body.access_token)}` : '';
      window.location.assign(`/orders/${body.number}${token}`);
    } catch {
      setState('error');
      setError('That did not work. Check your connection and try again.');
    }
  }

  return (
    <div class="place">
      <button
        type="button"
        class="btn btn-primary"
        onClick={place}
        disabled={state === 'working'}
      >
        {state === 'working' ? 'Placing your order' : 'Place order'}
      </button>

      <p class="live" role="status" aria-live="polite">
        {state === 'working' && <span>Placing your order</span>}
        {error && <span class="error-text">{error}</span>}
      </p>

      <style>{`
        .place { display: flex; flex-direction: column; gap: calc(var(--space) * 2); align-items: flex-start; }
        .place .btn { min-width: 200px; }
        .live { min-height: 21px; font-size: 14px; }
      `}</style>
    </div>
  );
}
