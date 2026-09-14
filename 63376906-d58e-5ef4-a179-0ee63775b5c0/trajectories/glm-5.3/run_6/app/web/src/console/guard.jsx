import { useEffect, useState } from 'preact/hooks';
import { meNow, getStoredToken } from '../lib/api.js';
import { navigate, Link } from '../lib/router.jsx';
import { useDoc } from '../lib/ui.jsx';

export function ConsoleGate({ children, title, description }) {
  useDoc(title || 'Console | Ravel', description || 'The Ravel console.');
  const [me, setMe] = useState(null);
  const [state, setState] = useState('checking');
  useEffect(() => {
    if (!getStoredToken()) {
      navigate('/login');
      return;
    }
    meNow().then((m) => {
      if (!m) { navigate('/login'); return; }
      setMe(m);
      setState('ready');
    });
  }, []);
  if (state !== 'ready') {
    return <main id="main" class="page"><p class="loading-words">The console is checking your session and will redirect if there is none.</p></main>;
  }
  return (
    <>
      <nav class="consolebar" aria-label="Console sections">
        <Link href="/console">Board</Link>
        <Link href="/console/intake">Intake</Link>
        <Link href="/console/record">Record</Link>
        <Link href="/console/reconciliation">Reconciliation</Link>
        <Link href="/console/certificates">Certificates</Link>
        <Link href="/console/deviations">Deviations</Link>
        <Link href="/console/overrides">Overrides</Link>
        <span class="dep">{me.email} — {(me.roles || []).join(', ')} — {(me.sites || []).join(', ')}</span>
      </nav>
      <main id="main" class="page console">
        {children}
      </main>
    </>
  );
}
