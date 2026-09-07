import { useEffect, useState } from 'preact/hooks';
import { api, formatMinor, publishCartCount, announce } from '../lib/client.js';

const MEDIA = {
  'VELA-A1-GRAPHITE': '/media/flagship.jpg',
  'VELA-A1-SAND': '/media/flagship-sand.jpg',
  'VELA-A1-YELLOW': '/media/flagship-yellow.jpg',
  'VELA-CRICKET-GRAPHITE': '/media/compact.jpg',
  'VELA-CRICKET-YELLOW': '/media/compact-yellow.jpg',
  'VELA-CASE-STD': '/media/case.jpg',
  'VELA-CABLE-1M': '/media/cable.jpg',
  'VELA-CABLE-2M': '/media/cable.jpg',
};

/**
 * The cart, edited in place. Quantities are optimistic in the interface and
 * authoritative on the server: the number moves at once, the totals show a
 * pending state, and a rejection reverts the number and states the reason.
 */
export default function CartView({ initialCart = null }) {
  const [cart, setCart] = useState(initialCart);
  const [loading, setLoading] = useState(!initialCart);
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState({});
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const d = await api('/cart');
      setCart(d.cart);
      publishCartCount(d.cart.item_count);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialCart) load();
    else publishCartCount(initialCart.item_count);
  }, []);

  const setQuantity = async (line, quantity) => {
    if (quantity < 1 || quantity > 10) return;
    const previous = line.quantity;
    setOptimistic((o) => ({ ...o, [line.id]: quantity })); // the number moves at once
    setPending(true);
    setError(null);
    try {
      const d = await api(`/cart/lines/${line.id}`, { method: 'PATCH', body: { quantity } });
      setCart(d.cart);
      publishCartCount(d.cart.item_count);
      setOptimistic((o) => { const n = { ...o }; delete n[line.id]; return n; });
    } catch (err) {
      // A rejection reverts the number and states the reason.
      setOptimistic((o) => { const n = { ...o }; delete n[line.id]; return n; });
      setError(err.message);
      announce(err.message);
      void previous;
    } finally {
      setPending(false);
    }
  };

  const remove = async (line) => {
    setPending(true);
    setError(null);
    try {
      const d = await api(`/cart/lines/${line.id}`, { method: 'DELETE' });
      setCart(d.cart);
      publishCartCount(d.cart.item_count);
      announce(`${line.title} removed from your cart.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };

  const toggleProtection = async (enabled) => {
    setPending(true);
    try {
      const d = await api('/cart/protection', { method: 'POST', body: { enabled } });
      setCart(d.cart);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };

  // Loading states reserve the space their content will occupy.
  if (loading) {
    return (
      <div class="cart-layout">
        <div class="stack" aria-busy="true" aria-live="polite">
          <span class="visually-hidden">Loading your cart.</span>
          {[0, 1].map((i) => (
            <div class="card" key={i} style="display:grid;grid-template-columns:96px minmax(0,1fr);gap:calc(var(--unit)*4)">
              <div class="skeleton" style="height:72px"></div>
              <div class="stack" style="gap:calc(var(--unit)*2)">
                <div class="skeleton" style="height:20px;width:40%"></div>
                <div class="skeleton" style="height:16px;width:24%"></div>
                <div class="skeleton" style="height:32px;width:30%"></div>
              </div>
            </div>
          ))}
        </div>
        <div class="card" style="height:280px"><div class="skeleton" style="height:100%"></div></div>
      </div>
    );
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <div class="empty">
        <p>Your cart is empty.</p>
        <p class="small" style="margin-top:calc(var(--unit)*2)"><a href="/shop">Go to the shop</a>.</p>
      </div>
    );
  }

  return (
    <div class="cart-layout">
      <div>
        {/* A price or availability change renders above the lines as a persistent
            notice that cannot be dismissed. */}
        {cart.notices.map((n) => (
          <div class="notice notice-danger" role="status" key={n.sku + n.kind}>
            <p>{n.message}</p>
          </div>
        ))}

        {error && <div class="notice notice-danger" role="alert"><p>{error}</p></div>}

        <ul style="list-style:none;padding:0;margin:0" class="stack">
          {cart.lines.map((line) => {
            const shown = optimistic[line.id] ?? line.quantity;
            return (
              <li class="card cart-line" key={line.id}>
                <img
                  class="media"
                  src={MEDIA[line.sku] || '/media/compact.jpg'}
                  alt=""
                  width="96" height="72"
                  style="width:96px;height:72px;aspect-ratio:auto"
                />
                <div>
                  <div class="row-between" style="align-items:flex-start">
                    <div>
                      <p style="font-weight:700"><a href={`/shop/${line.handle}`} style="text-decoration:none">{line.title}</a></p>
                      <p class="small muted">{line.option_value}</p>
                      <p class="small muted mono">{line.sku}</p>
                    </div>
                    <p class="money" style="font-weight:700">{formatMinor(line.total_minor)}</p>
                  </div>

                  <div class="row" style="margin-top:calc(var(--unit)*3);gap:calc(var(--unit)*3)">
                    <div class="row" style="gap:calc(var(--unit)*2)">
                      <button
                        type="button" class="btn btn-secondary btn-sm"
                        onClick={() => setQuantity(line, shown - 1)}
                        disabled={shown <= 1}
                        aria-label={`One fewer ${line.title}`}
                      >−</button>
                      <output class="tnum" style="min-width:3ch;text-align:center;font-weight:700">{shown}</output>
                      <button
                        type="button" class="btn btn-secondary btn-sm"
                        onClick={() => setQuantity(line, shown + 1)}
                        disabled={shown >= Math.min(10, line.available)}
                        aria-label={`One more ${line.title}`}
                      >+</button>
                    </div>
                    <span class="small muted money">{formatMinor(line.unit_price_minor)} each</span>
                    <button type="button" class="btn-quiet" onClick={() => remove(line)}>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <aside class="card" aria-label="Summary">
        <h2 style="font-size:16px;line-height:24px;margin-bottom:calc(var(--unit)*4)">Summary</h2>

        <table class="data" style="margin-bottom:calc(var(--unit)*4)">
          <tbody>
            <tr>
              <th scope="row" style="font-weight:400">Estimated subtotal</th>
              <td class="num money">{formatMinor(cart.subtotal_minor)}</td>
            </tr>
            <tr>
              <th scope="row" style="font-weight:400">Estimated delivery</th>
              <td class="num money">{cart.shipping_method ? formatMinor(cart.shipping_minor) : '—'}</td>
            </tr>
            <tr>
              <th scope="row" style="font-weight:400">Estimated tax</th>
              <td class="num money">{formatMinor(cart.tax_minor)}</td>
            </tr>
            <tr>
              <th scope="row" style="font-weight:700">Estimated total</th>
              <td class="num money" style="font-weight:700">{formatMinor(cart.total_minor)}</td>
            </tr>
          </tbody>
        </table>

        <p class="small muted" aria-live="polite" style="margin-bottom:calc(var(--unit)*4)">
          {pending ? 'Updating the totals.' : 'Estimated. We will show the exact amount once we know where it is going.'}
        </p>

        {cart.protection_rung && (
          <label class="row" style="gap:calc(var(--unit)*2);margin-bottom:calc(var(--unit)*4);align-items:flex-start;flex-wrap:nowrap">
            <input
              type="checkbox"
              checked={cart.protection_enabled}
              onChange={(e) => toggleProtection(e.currentTarget.checked)}
              style="margin-top:4px"
            />
            <span class="small">{cart.protection_rung.label}</span>
          </label>
        )}

        <a class="btn" href="/checkout/where-it-goes" style="width:100%">Check out</a>
      </aside>
    </div>
  );
}
