import { useRef, useState } from 'preact/hooks';

/**
 * Placing shows `Placing your order`, and success lands on the order route.
 *
 * The idempotency key is minted once per mounted control, so a double click or a
 * retry after a dropped connection returns the same order rather than raising a
 * second invoice.
 */
export default function PlaceOrder({ total }) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const key = useRef(`vela-${crypto.randomUUID()}`);

  async function place() {
    if (state === 'working') return;
    setState('working');
    setError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key.current,
        },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setState('error');
        if (body.code === 'price_changed' || body.code === 'cart_changed') {
          // The person returns to a re-priced cart carrying that notice.
          window.location.href = '/cart';
          return;
        }
        setError(
          body.message ||
            (body.request_id
              ? `Something went wrong at our end. Reference ${body.request_id}.`
              : 'That did not work.'),
        );
        return;
      }

      const query = body.access_token
        ? `?access_token=${encodeURIComponent(body.access_token)}`
        : '';
      window.location.href = `/orders/${encodeURIComponent(body.number)}${query}`;
    } catch {
      setState('error');
      setError('That did not work. Check your connection and try again.');
    }
  }

  return (
    <div class="stack--tight">
      <button
        class="button button--primary"
        type="button"
        onClick={place}
        disabled={state === 'working'}
        aria-disabled={state === 'working'}
        style="width:100%"
      >
        {state === 'working' ? 'Placing your order' : `Place order, ${total}`}
      </button>

      <p role="status" aria-live="polite" style="min-height:1.5rem">
        {state === 'working' && <span>Placing your order</span>}
        {state === 'error' && error && <span class="chip chip--wrong">{error}</span>}
      </p>
    </div>
  );
}
