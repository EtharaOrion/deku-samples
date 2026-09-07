import { useState } from 'preact/hooks';

// Placing shows `Placing your order`, and success lands on the order route.
export default function PlaceOrder({ idempotencyKey, expectedTotalMinor, email }) {
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');

  const place = async () => {
    if (state === 'working') return;
    setState('working');
    setMessage('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // The same key on a replay returns the same order.
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({ expected_total_minor: expectedTotalMinor }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.code === 'price_changed' || body.code === 'total_changed') {
          window.location.href = '/cart?repriced=1';
          return;
        }
        setState('error');
        setMessage(body.message || 'That did not work.');
        return;
      }
      const token = body.access_token ? `?access_token=${encodeURIComponent(body.access_token)}` : '';
      window.location.href = `/orders/${body.number}${token}`;
    } catch {
      setState('error');
      setMessage('That did not work. Check your connection and try again.');
    }
  };

  return (
    <div class="place">
      <button class="button place-button" type="button" onClick={place} disabled={state === 'working'}>
        {state === 'working' ? 'Placing your order' : 'Place order'}
      </button>
      <p class="place-status" role="status" aria-live="polite">
        {state === 'working' ? `Placing your order. We will email ${email}.` : ''}
      </p>
      {state === 'error' && (
        <p class="notice notice-wrong" role="alert">{message}</p>
      )}
    </div>
  );
}
