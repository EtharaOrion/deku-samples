import { render } from 'preact';
import './styles.css';
import { useEffect, useState } from 'preact/hooks';
import { usePath } from './router';
import { TopBar, Footer } from './components/Chrome';
import { me, token, type Me } from './lib/api';

import Home from './routes/Home';
import Product from './routes/Product';
import Technology from './routes/Technology';
import About from './routes/About';
import Careers from './routes/Careers';
import News from './routes/News';
import Contact from './routes/Contact';
import Privacy from './routes/Privacy';
import Verify from './routes/Verify';
import Login from './routes/console/Login';
import Console from './routes/console/Console';
import Balance from './routes/console/Balance';
import Genealogy from './routes/console/Genealogy';
import Certificates from './routes/console/Certificates';
import RecordView from './routes/console/RecordView';
import Reconciliation from './routes/console/Reconciliation';
import Collectors from './routes/console/Collectors';
import Contracts from './routes/console/Contracts';

const TITLES: Record<string, [string, string]> = {
  '/': ['Ravel — tomorrow’s materials, made from today’s waste', 'Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.'],
  '/product': ['Ravel — same material, better origin', 'Recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise.'],
  '/technology': ['Ravel — the four process steps', 'Dissolution, depolymerisation, purification, repolymerisation.'],
  '/about': ['Ravel — about', 'The hard facts behind Ravel, with their sources, years and geographies.'],
  '/careers': ['Ravel — careers', 'Open positions at Ravel and why this problem matters.'],
  '/news': ['Ravel — news', 'News from Ravel with its outlet, date, link and language.'],
  '/contact': ['Ravel — contact', 'Four enquiry types, four destinations, four stated response times.'],
  '/privacy': ['Ravel — privacy policy', 'What Ravel keeps, why, for how long, and how to have it removed.'],
  '/login': ['Sign in — Ravel console', 'Sign in to the Ravel production and attestation console.']
};

function titleFor(path: string): [string, string] {
  if (path.startsWith('/verify/')) return [`Certificate ${path.split('/')[2]} — Ravel verification`, 'The public verification answer for a Ravel certificate.'];
  if (path.startsWith('/console')) {
    const key = Object.keys(CONSOLE_TITLES).find((k) => path === k || path.startsWith(k + '/'));
    if (key) return CONSOLE_TITLES[key];
    return ['Console — Ravel', 'The Ravel production and attestation console.'];
  }
  return TITLES[path] || ['Ravel', 'Ravel produces low-carbon, virgin-quality recycled polymers.'];
}

const CONSOLE_TITLES: Record<string, [string, string]> = {
  '/console': ['Console board — Ravel', 'One column per process stage and one card per run.'],
  '/console/balance': ['Balance — Ravel console', 'Credits in, credits out and credits available per category, with derivations.'],
  '/console/lots': ['Lots — Ravel console', 'The lot register with claim types and derived content.'],
  '/console/certificates': ['Certificates — Ravel console', 'The certificate register, the signing wizard and withdrawal.'],
  '/console/record': ['The record — Ravel console', 'The append-only record, its queries, exports and retention.'],
  '/console/reconciliation': ['Reconciliation — Ravel console', 'Six figures expected to be non-zero.'],
  '/console/collectors': ['Collectors — Ravel console', 'Collector approval periods and findings.'],
  '/console/contracts': ['Contracts — Ravel console', 'Contract projections and the offtake floor.']
};

function App() {
  const path = usePath();
  const [user, setUser] = useState<Me | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    document.title = 'Loading — Ravel';
    setBooted(false);
    if (path.startsWith('/console')) {
      if (!token()) {
        window.history.replaceState({}, '', '/login?next=' + encodeURIComponent(path));
        setUser(null);
        setBooted(true);
        return;
      }
      me().then((m) => { setUser(m); setBooted(true); })
        .catch(() => { setUser(null); setBooted(true); });
    } else {
      setUser(null);
      setBooted(true);
    }
  }, [path]);

  useEffect(() => {
    const [t, d] = titleFor(path);
    document.title = t;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', d);
    let robots = document.querySelector('meta[name="robots"]');
    if (path.startsWith('/verify/')) {
      if (!robots) {
        robots = document.createElement('meta');
        robots.setAttribute('name', 'robots');
        document.head.appendChild(robots);
      }
      robots.setAttribute('content', 'noindex, nofollow');
    } else if (robots) {
      robots.setAttribute('content', 'index, follow');
    }
  }, [path]);

  const isConsole = path.startsWith('/console') || path.startsWith('/login');
  const loginPath = path.startsWith('/login');

  let body: any = null;
  if (loginPath) {
    body = <Login />;
  } else if (path.startsWith('/console')) {
    if (!booted) body = <p class="label" role="status">The console is loading.</p>;
    else if (!user) body = <Login />;
    else body = renderConsole(path, user);
  } else if (path.startsWith('/verify/')) {
    body = <Verify number={path.split('/')[2]} />;
  } else if (path === '/product') body = <Product />;
  else if (path === '/technology') body = <Technology />;
  else if (path === '/about') body = <About />;
  else if (path === '/careers') body = <Careers />;
  else if (path === '/news') body = <News />;
  else if (path === '/contact') body = <Contact />;
  else if (path === '/privacy') body = <Privacy />;
  else body = <Home />;

  return (
    <div>
      <TopBar current={path} />
      <main id="main">{body}</main>
      <Footer />
    </div>
  );
}

function renderConsole(path: string, user: Me): any {
  if (path === '/console' || path === '/console/') return <Console user={user} />;
  if (path.startsWith('/console/balance')) return <Balance user={user} />;
  if (path.includes('/genealogy')) return <Genealogy user={user} />;
  if (path.startsWith('/console/certificates')) return <Certificates user={user} />;
  if (path.startsWith('/console/record')) return <RecordView user={user} />;
  if (path.startsWith('/console/reconciliation')) return <Reconciliation user={user} />;
  if (path.startsWith('/console/collectors')) return <Collectors user={user} />;
  if (path.startsWith('/console/contracts')) return <Contracts user={user} />;
  return <Console user={user} />;
}

render(<App />, document.getElementById('app')!);
