import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/client.js';

/**
 * The cart control in the compact bar. Its accessible name states the item count;
 * the badge appears only above zero and reads 99+ above ninety-nine.
 */
export default function CartControl({ initialCount = 0 }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    let live = true;
    const onCart = (e) => {
      if (typeof e.detail?.count === 'number') setCount(e.detail.count);
    };
    window.addEventListener('vela:cart', onCart);

    // Reconcile with the server once, so a cart held in another tab still shows.
    api('/cart')
      .then((d) => { if (live && d?.cart) setCount(d.cart.item_count || 0); })
      .catch(() => { /* the badge simply stays as rendered */ });

    return () => { live = false; window.removeEventListener('vela:cart', onCart); };
  }, []);

  const badge = count > 99 ? '99+' : String(count);
  const name = count === 1 ? 'Cart, 1 item' : `Cart, ${count} items`;

  return (
    <a href="/cart" class="btn btn-secondary btn-sm" aria-label={name}>
      <span aria-hidden="true">Cart</span>
      {count > 0 && (
        <span
          class="chip tnum"
          aria-hidden="true"
          style="background:var(--fg);color:var(--bg);border-color:var(--fg)"
        >
          {badge}
        </span>
      )}
    </a>
  );
}
