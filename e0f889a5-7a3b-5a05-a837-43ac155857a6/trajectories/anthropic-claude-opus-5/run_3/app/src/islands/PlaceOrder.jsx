import { useEffect, useRef, useState } from 'preact/hooks';
import { formatMoney } from '../lib/money.js';

/**
 * The one control that places the order.
 *
 * It carries an Idempotency-Key minted once for this attempt, so a double
 * click, a retry or a refresh returns the same order rather than making a
 * second one. The total authorized is the figure this step showed.
 */
export default function PlaceOrder({ totalMinor }) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);
  const keyRef = useRef(null);

  /**
   * The key is minted in the browser, because this island is server-rendered
   * first and there is no session storage on the server. It survives a reload
   * of this step, so a refresh mid-flight still resolves to one order.
   */
  function idempotencyKey() {
    if (keyRef.current) return keyRef.current;
    let key = null;
    try {
      key = sessionStorage.getItem('vela:idempotency');
    } catch {
      key = null;
    }
    if (!key) {
      key =
        (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
        `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        sessionStorage.setItem('vela:idempotency', key);
      } catch {
        /* storage is unavailable; the key still holds for this page */
      }
    }
    keyRef.current = key;
    return key;
  }

  async function place() {
    if (state === 'working') return;
    const key = idempotencyKey();
    setState('working');
    setError(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({ expected_total_minor: totalMinor }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setState('idle');
        // A refused order returns the person to a re-priced cart carrying the
        // notice.
        if (body?.code === 'price_changed' || body?.code === 'total_changed') {
          window.location.assign('/cart');
          return;
        }
        setError(body?.message || 'That did not work.');
        return;
      }

      // This attempt is finished; a later checkout mints a new key.
      try {
        sessionStorage.removeItem('vela:idempotency');
      } catch {
        /* nothing to clear */
      }
      const order = body.order;
      const token = order.access_token ? `?access_token=${encodeURIComponent(order.access_token)}` : '';
      window.location.assign(`/orders/${order.number}${token}`);
    } catch {
      setState('idle');
      setError('That did not work.');
    }
  }

  return (
    <div class="place">
      {error && (
        <div class="notice notice--error" role="alert">
          <span class="notice__body">{error}</span>
        </div>
      )}

      <button class="btn place__btn" type="button" onClick={place} disabled={state === 'working'}>
        {state === 'working' ? 'Placing your order' : `Place order — ${formatMoney(totalMinor)}`}
      </button>

      <p class="live-region small muted" role="status" aria-live="polite">
        {state === 'working' ? 'Placing your order' : ''}
      </p>

      <style>{`
        .place__btn { width: 100%; }
        .live-region { min-height: 21px; margin: calc(var(--unit) * 2) 0 0; }
      `}</style>
    </div>
  );
}
