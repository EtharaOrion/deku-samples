import { useEffect, useState } from 'preact/hooks';

export default function CartCount({ initial = 0, signedIn = false, email = '' }) {
  const [count, setCount] = useState(initial);
  useEffect(() => {
    const update = async () => {
      try {
        const res = await fetch('/api/cart', { credentials: 'same-origin' });
        if (!res.ok) return;
        const cart = await res.json();
        const n = (cart.lines || []).reduce((a, l) => a + l.quantity, 0);
        setCount(n);
      } catch {}
    };
    update();
    const onMsg = (e) => { if (e.data === 'vela:cart') update(); };
    window.addEventListener('vela-cart', onMsg);
    window.addEventListener('message', onMsg);
    const interval = setInterval(update, 4000);
    return () => { clearInterval(interval); window.removeEventListener('vela-cart', onMsg); window.removeEventListener('message', onMsg); };
  }, []);
  const label = count === 0 ? 'Cart, empty' : `Cart, ${count} item${count === 1 ? '' : 's'}`;
  return (
    <div class="bar-right">
      {signedIn ? (
        <button
          class="btn btn-quiet"
          onClick={async () => {
            try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
            localStorage.removeItem('vela_token');
            document.cookie = 'vela_token=; Path=/; Max-Age=0';
            window.location.href = '/';
          }}
        >
          Sign out {email ? <span class="muted">({email})</span> : null}
        </button>
      ) : (
        <a class="btn btn-quiet" href="/sign-in">Sign in</a>
      )}
      <a class="btn" href="/cart" aria-label={label}>
        Cart{count > 0 ? <span class="badge tnum" aria-hidden="true">{count > 99 ? '99+' : count}</span> : null}
      </a>
    </div>
  );
}
