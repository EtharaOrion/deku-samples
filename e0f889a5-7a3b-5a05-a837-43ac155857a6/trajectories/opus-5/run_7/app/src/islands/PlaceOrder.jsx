import { useState, useRef } from 'preact/hooks';
import { api, formatMinor, publishCartCount } from '../lib/client.js';

/**
 * The one control that places the order. It carries an Idempotency-Key generated
 * once, so a double submit returns the same order rather than a second one, and
 * it authorizes the figure the final step showed.
 */
export default function PlaceOrder({ totalMinor }) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);
  const keyRef = useRef(null);

  if (!keyRef.current) {
    keyRef.current =
      (crypto.randomUUID && crypto.randomUUID()) ||
      `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const place = async () => {
    if (state === 'placing') return;
    setState('placing');
    setError(null);
    try {
      const d = await api('/orders', {
        method: 'POST',
        headers: { 'idempotency-key': keyRef.current },
        body: { expected_total_minor: totalMinor },
      });

      // Keep the access token so a guest can return to the order.
      try {
        const held = JSON.parse(decodeURIComponent((document.cookie.match(/(?:^|; )vela_order_tokens=([^;]*)/) || [])[1] || '{}'));
        held[d.order.number] = d.access_token;
        document.cookie = `vela_order_tokens=${encodeURIComponent(JSON.stringify(held))}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
      } catch { /* the order page still works from the address it lands on */ }

      publishCartCount(0);
      window.location.assign(`/orders/${d.order.number}?placed=1`);
    } catch (err) {
      setState('idle');
      if (err.code === 'price_changed' || err.code === 'total_changed') {
        // The person returns to a re-priced cart carrying that notice.
        window.location.assign('/cart?repriced=1');
        return;
      }
      setError(
        err.code === 'out_of_stock'
          ? `${err.data?.title || 'An item'} sold out while you were checking out. Your cart has been left as it is.`
          : err.message,
      );
    }
  };

  return (
    <div>
      <button type="button" class="btn" onClick={place} disabled={state === 'placing'} style="width:100%">
        {state === 'placing' ? 'Placing your order' : `Place the order — ${formatMinor(totalMinor)}`}
      </button>

      <p class="small muted" aria-live="polite" style="margin-top:calc(var(--unit)*3)">
        {state === 'placing' ? 'Placing your order' : 'We will email a confirmation once the order is placed.'}
      </p>

      {error && (
        <div class="notice notice-danger" role="alert" style="margin-top:calc(var(--unit)*4)">
          <p>{error}</p>
          <p class="small" style="margin-top:var(--unit)"><a href="/cart">Go back to the cart</a>.</p>
        </div>
      )}
    </div>
  );
}
