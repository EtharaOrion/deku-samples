import { useState } from 'preact/hooks';
import { formatMinor } from '../lib/format.js';

/**
 * The cart, edited in place.
 *
 * Quantities are optimistic in the interface and authoritative on the server:
 * the number moves at once, the totals show a pending state, and a rejection
 * reverts the number and states the reason.
 */
export default function CartControls({ initial }) {
  const [cart, setCart] = useState(initial);
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState({});
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null);

  async function send(path, options, revert) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(path, {
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        ...options,
      });
      const body = await res.json();
      if (!res.ok) {
        // A rejection reverts the number and states the reason.
        revert?.();
        setError(body.message || 'That did not work.');
        return null;
      }
      setCart(body);
      setOptimistic({});
      window.dispatchEvent(new CustomEvent('vela:cart-changed', { detail: body }));
      return body;
    } catch {
      revert?.();
      setError('That did not work. Check your connection and try again.');
      return null;
    } finally {
      setPending(false);
    }
  }

  function changeQuantity(line, next) {
    if (next < 1 || next > 10) return;
    const previous = optimistic[line.id] ?? line.quantity;
    // The number moves at once.
    setOptimistic((o) => ({ ...o, [line.id]: next }));
    send(`/api/cart/lines/${line.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: next }),
    }, () => setOptimistic((o) => ({ ...o, [line.id]: previous })));
  }

  function removeLine(line) {
    send(`/api/cart/lines/${line.id}`, { method: 'DELETE' });
    setConfirming(null);
  }

  function toggleProtection(enabled) {
    send('/api/cart/protection', { method: 'POST', body: JSON.stringify({ enabled }) });
  }

  const lines = cart.lines || [];
  const rung = cart.protection_rung;

  if (!lines.length) {
    return (
      <div class="empty card">
        <p>Your cart is empty.</p>
        <a href="/shop">Shop</a>
        <style>{`
          .empty {
            padding: calc(var(--space) * 6);
            display: flex; flex-direction: column; gap: calc(var(--space) * 2);
            align-items: flex-start;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div class="cart-grid">
      <div class="lines-side">
        {/* A price or availability change renders above the lines as a
            persistent notice that cannot be dismissed. */}
        {(cart.notices || []).length > 0 && (
          <ul class="notices">
            {cart.notices.map((n) => (
              <li class="notice notice-danger" key={n.line_id + n.kind}>{n.message}</li>
            ))}
          </ul>
        )}

        {error && <p class="notice notice-danger" role="alert">{error}</p>}

        <ul class="lines">
          {lines.map((line) => {
            const shown = optimistic[line.id] ?? line.quantity;
            return (
              <li class="line" key={line.id}>
                <div class="line-media" aria-hidden="true"></div>

                <div class="line-body">
                  <a class="line-title" href={`/shop/${line.handle}`}>{line.title}</a>
                  <p class="hint">{line.option_value}</p>
                  <p class="hint money tnum">{formatMinor(line.unit_price_minor)} each</p>
                </div>

                <div class="stepper" role="group" aria-label={`Quantity of ${line.title}`}>
                  <button
                    type="button" class="step"
                    onClick={() => changeQuantity(line, shown - 1)}
                    disabled={shown <= 1}
                  >
                    <span aria-hidden="true">−</span>
                    <span class="visually-hidden">One fewer {line.title}</span>
                  </button>
                  <output class="qty-value tnum">{shown}</output>
                  <button
                    type="button" class="step"
                    onClick={() => changeQuantity(line, shown + 1)}
                    disabled={shown >= Math.min(10, line.available)}
                  >
                    <span aria-hidden="true">+</span>
                    <span class="visually-hidden">One more {line.title}</span>
                  </button>
                </div>

                <p class={`line-total money tnum${pending ? ' pending' : ''}`}>
                  {formatMinor(line.unit_price_minor * shown)}
                </p>

                {/* Every destructive action confirms first. */}
                {confirming === line.id ? (
                  <div class="confirm">
                    <p>Remove it?</p>
                    <button type="button" class="btn" onClick={() => removeLine(line)}>Remove</button>
                    <button type="button" class="btn" onClick={() => setConfirming(null)}>Keep</button>
                  </div>
                ) : (
                  <button type="button" class="btn remove" onClick={() => setConfirming(line.id)}>
                    Remove<span class="visually-hidden"> {line.title}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <aside class="summary card" aria-label="Cart summary">
        <h2>Summary</h2>

        <dl class="totals">
          <div>
            <dt>Subtotal</dt>
            <dd class="money tnum">{formatMinor(cart.subtotal_minor)}</dd>
          </div>
          <div>
            <dt>Estimated delivery</dt>
            <dd class="money tnum">{formatMinor(cart.shipping_minor)}</dd>
          </div>
          {cart.protection_minor > 0 && (
            <div>
              <dt>Shipment protection</dt>
              <dd class="money tnum">{formatMinor(cart.protection_minor)}</dd>
            </div>
          )}
          <div>
            <dt>Estimated tax</dt>
            <dd class="money tnum">{formatMinor(cart.tax_minor)}</dd>
          </div>
          <div class="grand">
            <dt>Total</dt>
            <dd class="money tnum">{formatMinor(cart.total_minor)}</dd>
          </div>
        </dl>

        <p class="hint">Estimated. We will show the exact amount once we know where it is going.</p>

        {rung && (
          <label class="protect">
            <input
              type="checkbox"
              checked={Boolean(cart.protection_enabled)}
              onChange={(e) => toggleProtection(e.currentTarget.checked)}
            />
            <span>Protect this shipment against loss, theft and damage for {formatMinor(rung.price_minor)}</span>
          </label>
        )}

        <a class="btn btn-primary checkout" href="/checkout/where-it-goes">Check out</a>
      </aside>

      <style>{`
        .cart-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 320px);
          gap: calc(var(--space) * 8);
          align-items: start;
        }
        .lines-side { display: flex; flex-direction: column; gap: calc(var(--space) * 4); }
        .notices, .lines { list-style: none; display: flex; flex-direction: column; gap: calc(var(--space) * 3); }

        .line {
          display: grid;
          grid-template-columns: 64px minmax(0, 1fr) auto auto auto;
          gap: calc(var(--space) * 3);
          align-items: center;
          border: var(--border-w) solid var(--rule);
          border-radius: var(--radius);
          padding: calc(var(--space) * 3);
          background: var(--bg-raised);
        }
        .line-media {
          width: 64px; height: 48px;
          background: var(--bg-sunken);
          border: var(--border-w) solid var(--rule);
          border-radius: 0;
        }
        .line-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .line-title { font-weight: 700; text-decoration: none; }
        .line-total { min-width: 84px; text-align: right; font-weight: 700; }
        /* The totals show a pending state while the server settles. */
        .line-total.pending { opacity: 0.5; }

        .stepper { display: inline-flex; align-items: center; border: var(--border-w) solid var(--rule-strong); border-radius: var(--radius); }
        .step { width: 32px; height: 32px; border: 0; background: transparent; cursor: pointer; }
        .step:hover:not(:disabled) { background: var(--bg-sunken); }
        .step:disabled { opacity: 0.4; cursor: not-allowed; }
        .qty-value { min-width: 30px; text-align: center; font-variant-numeric: tabular-nums; }

        .remove { min-height: 32px; font-size: 14px; }
        .confirm { display: flex; align-items: center; gap: calc(var(--space) * 2); font-size: 14px; }

        .summary {
          padding: calc(var(--space) * 4);
          display: flex; flex-direction: column; gap: calc(var(--space) * 4);
          position: sticky; top: calc(var(--header-h) + var(--space) * 4);
        }
        .summary h2 { font-size: 16px; }
        .totals { display: flex; flex-direction: column; gap: calc(var(--space) * 2); font-size: 14px; }
        .totals > div { display: flex; justify-content: space-between; gap: calc(var(--space) * 3); }
        .totals dd { margin: 0; }
        .grand { border-top: var(--border-w) solid var(--rule); padding-top: calc(var(--space) * 2); font-weight: 700; font-size: 16px; }
        .protect { display: flex; gap: calc(var(--space) * 2); font-size: 14px; align-items: flex-start; }
        .checkout { width: 100%; }

        @media (max-width: 63.999rem) {
          .cart-grid { grid-template-columns: minmax(0, 1fr); }
          .line { grid-template-columns: 48px minmax(0, 1fr); grid-auto-flow: row; }
          .summary { position: static; }
        }
      `}</style>
    </div>
  );
}
