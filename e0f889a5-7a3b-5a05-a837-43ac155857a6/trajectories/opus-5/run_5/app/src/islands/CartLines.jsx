import { useState } from 'preact/hooks';
import { formatMinor } from '../lib/format.js';

/**
 * Quantities are optimistic in the interface and authoritative on the server:
 * the number moves at once, the totals show a pending state, and a rejection
 * reverts the number and states the reason.
 */
export default function CartLines({ initial }) {
  const [cart, setCart] = useState(initial);
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState({});
  const [error, setError] = useState('');

  async function send(path, options, revert) {
    setPending(true);
    setError('');
    try {
      const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A rejection reverts the number and states the reason.
        revert?.();
        setError(body.message || 'That did not work.');
        return null;
      }
      setCart(body);
      setOptimistic({});
      window.dispatchEvent(new CustomEvent('vela:cart', { detail: body }));
      return body;
    } catch {
      revert?.();
      setError('That did not work.');
      return null;
    } finally {
      setPending(false);
    }
  }

  const setQuantity = (line, quantity) => {
    if (quantity < 1 || quantity > 10) return;
    const previous = optimistic[line.id] ?? line.quantity;
    setOptimistic((o) => ({ ...o, [line.id]: quantity }));
    send(
      `/api/cart/lines/${line.id}`,
      { method: 'PATCH', body: JSON.stringify({ quantity }) },
      () => setOptimistic((o) => ({ ...o, [line.id]: previous })),
    );
  };

  const remove = (line) =>
    send(`/api/cart/lines/${line.id}`, { method: 'DELETE' });

  const toggleProtection = (enabled) =>
    send('/api/cart/protection', { method: 'POST', body: JSON.stringify({ enabled }) });

  const lines = cart.lines ?? [];

  if (!lines.length) {
    return (
      <div class="empty-state">
        <p>Your cart is empty.</p>
        <p style="margin-top:0.5rem"><a href="/shop">Go to the shop</a></p>
      </div>
    );
  }

  return (
    <div class="grid grid--wide" style="align-items:start">
      <div>
        {/* A price or availability change renders above the lines as a
            persistent notice that cannot be dismissed. */}
        {(cart.notices ?? []).map((notice) => (
          <p class="notice" key={notice.sku + notice.kind} style="margin-bottom:0.75rem" role="status">
            {notice.message}
          </p>
        ))}

        {error && <p class="notice" role="alert" style="margin-bottom:0.75rem">{error}</p>}

        <ul style="list-style:none;margin:0;padding:0" class="stack">
          {lines.map((line) => {
            const quantity = optimistic[line.id] ?? line.quantity;
            return (
              <li key={line.id} class="card">
                <div class="row" style="align-items:flex-start;gap:1rem">
                  <div class="cart-thumb" aria-hidden="true"></div>
                  <div style="flex:1;min-width:12rem">
                    <p style="font-weight:700">
                      <a href={`/shop/${line.handle}`} style="text-decoration:none">{line.title}</a>
                    </p>
                    <p style="color:var(--quiet);font-size:14px;line-height:21px">
                      {line.variant_summary}
                      <span class="mono" style="margin-left:0.5rem">{line.sku}</span>
                    </p>
                    <p class="money" style="margin-top:0.25rem">{formatMinor(line.unit_price_minor)} each</p>
                  </div>

                  <div class="row" style="gap:0.25rem">
                    <button
                      class="button button--quiet"
                      type="button"
                      onClick={() => setQuantity(line, quantity - 1)}
                      disabled={quantity <= 1}
                      aria-label={`One fewer ${line.title}`}
                    >−</button>
                    <input
                      class="input tnum"
                      style="width:3.5rem;text-align:center"
                      type="number"
                      min="1"
                      max="10"
                      value={quantity}
                      aria-label={`Quantity of ${line.title}`}
                      onChange={(e) => setQuantity(line, Number(e.currentTarget.value))}
                    />
                    <button
                      class="button button--quiet"
                      type="button"
                      onClick={() => setQuantity(line, quantity + 1)}
                      disabled={quantity >= 10}
                      aria-label={`One more ${line.title}`}
                    >+</button>
                  </div>

                  <p class="money" style="min-width:6rem;text-align:right;font-weight:700">
                    {formatMinor(line.unit_price_minor * quantity)}
                  </p>

                  <button
                    class="button button--quiet"
                    type="button"
                    onClick={() => remove(line)}
                  >Remove</button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <aside class="card" aria-label="Cart summary">
        <h2 class="section-title">Summary</h2>

        <table class="table" style="margin-top:0.75rem">
          <tbody>
            <tr>
              <th scope="row" style="font-weight:400">Subtotal</th>
              <td class="figure money">{formatMinor(cart.subtotal_minor)}</td>
            </tr>
            <tr>
              <th scope="row" style="font-weight:400">
                {cart.has_address ? 'Delivery' : 'Estimated delivery'}
              </th>
              <td class="figure money">{formatMinor(cart.shipping_minor ?? 0)}</td>
            </tr>
            {cart.protection_enabled && cart.protection_minor > 0 && (
              <tr>
                <th scope="row" style="font-weight:400">Shipment protection</th>
                <td class="figure money">{formatMinor(cart.protection_minor)}</td>
              </tr>
            )}
            <tr>
              <th scope="row" style="font-weight:400">
                {cart.has_address ? 'Tax' : 'Estimated tax'}
              </th>
              <td class="figure money">{formatMinor(cart.tax_minor ?? 0)}</td>
            </tr>
            <tr>
              <th scope="row">Total</th>
              <td class="figure money" style="font-weight:700">
                {pending ? <span style="color:var(--quiet)">Working</span> : formatMinor(cart.total_minor)}
              </td>
            </tr>
          </tbody>
        </table>

        {!cart.has_address && (
          <p style="margin-top:0.5rem;color:var(--quiet);font-size:14px;line-height:21px">
            Estimated. We will show the exact amount once we know where it is going.
          </p>
        )}

        {cart.protection_rung && (
          <p style="margin-top:1rem">
            <label class="row" style="gap:0.5rem;align-items:flex-start">
              <input
                type="checkbox"
                checked={cart.protection_enabled}
                onChange={(e) => toggleProtection(e.currentTarget.checked)}
              />
              <span>{cart.protection_rung.label}</span>
            </label>
          </p>
        )}

        <p style="margin-top:1rem">
          <a class="button button--primary" href="/checkout/where-it-goes" style="width:100%">
            Check out
          </a>
        </p>
      </aside>
    </div>
  );
}
