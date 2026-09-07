import { useEffect } from 'preact/hooks';
import { usePath, match, Link, navigate } from './lib/router.jsx';
import { getUser, clearSession } from './lib/api.js';

import Home from './routes/Home.jsx';
import Product from './routes/Product.jsx';
import Technology from './routes/Technology.jsx';
import About from './routes/About.jsx';
import Careers from './routes/Careers.jsx';
import News from './routes/News.jsx';
import Contact from './routes/Contact.jsx';
import Privacy from './routes/Privacy.jsx';
import Verify from './routes/Verify.jsx';
import Login from './routes/Login.jsx';

import Board from './routes/console/Board.jsx';
import Intake from './routes/console/Intake.jsx';
import RecordView from './routes/console/RecordView.jsx';
import Reconciliation from './routes/console/Reconciliation.jsx';
import Certificates from './routes/console/Certificates.jsx';
import CertificateDetail from './routes/console/CertificateDetail.jsx';
import Wizard from './routes/console/Wizard.jsx';
import Balance from './routes/console/Balance.jsx';
import BalanceList from './routes/console/BalanceList.jsx';
import Lots from './routes/console/Lots.jsx';
import LotDetail from './routes/console/LotDetail.jsx';
import Genealogy from './routes/console/Genealogy.jsx';
import RunDetail from './routes/console/RunDetail.jsx';
import Collectors from './routes/console/Collectors.jsx';
import BatchDetail from './routes/console/BatchDetail.jsx';
import Replay from './routes/console/Replay.jsx';

const PUBLIC_ROUTES = [
  ['/', Home, 'Ravel — recycled polymers with an origin you can verify'],
  ['/product', Product, 'Product — Ravel'],
  ['/technology', Technology, 'Technology — Ravel'],
  ['/about', About, 'About — Ravel'],
  ['/careers', Careers, 'Careers — Ravel'],
  ['/news', News, 'News — Ravel'],
  ['/contact', Contact, 'Contact — Ravel'],
  ['/privacy', Privacy, 'Privacy — Ravel'],
];

const CONSOLE_ROUTES = [
  ['/console', Board],
  ['/console/intake', Intake],
  ['/console/record', RecordView],
  ['/console/reconciliation', Reconciliation],
  ['/console/certificates', Certificates],
  ['/console/certificates/new/lot', Wizard],
  ['/console/certificates/new/claim', Wizard],
  ['/console/certificates/new/recipient', Wizard],
  ['/console/certificates/new/review', Wizard],
  ['/console/certificates/:number', CertificateDetail],
  ['/console/certificates/:number/replay', Replay],
  ['/console/balance', BalanceList],
  ['/console/balance/:id', Balance],
  ['/console/lots', Lots],
  ['/console/lots/:reference', LotDetail],
  ['/console/lots/:reference/genealogy', Genealogy],
  ['/console/runs/:reference', RunDetail],
  ['/console/batches/:reference', BatchDetail],
  ['/console/collectors', Collectors],
];

const META = {
  '/': 'Ravel returns mixed polyamide waste to virgin-quality pellet, and issues the certificate that proves where it came from.',
  '/product': 'Low-carbon, virgin-quality recycled Nylon 6 and 6,6, with the specification, the claim type and the scheme stated beside the grade.',
  '/technology': 'Dissolution, depolymerisation, purification and repolymerisation, with the mass in and the mass out of each stage.',
  '/about': 'Why recycled polyamide matters, with every figure carrying its source, its year and its geography.',
  '/careers': 'Open roles at Ravel, and why this problem matters.',
  '/news': 'Coverage of Ravel, each item carrying its outlet, its date, its link and its language.',
  '/contact': 'Four enquiry types, four destinations and four stated response times.',
  '/privacy': 'Who receives your data, what it is used for, how long it is kept and how to have it removed.',
};

export default function App() {
  const path = usePath();
  const user = getUser();

  const publicHit = PUBLIC_ROUTES.find(([p]) => p === path);
  const verifyParams = match('/verify/:number', path);
  const consoleHit = CONSOLE_ROUTES.map(([p, C]) => {
    const params = match(p, path);
    return params ? { Component: C, params, pattern: p } : null;
  }).find(Boolean);

  useEffect(() => {
    // every route carries its own metadata
    let title = 'Ravel';
    let description = META['/'];
    let robots = null;
    if (publicHit) { [, , title] = publicHit; description = META[path]; }
    else if (verifyParams) {
      title = `Verify certificate ${verifyParams.number} — Ravel`;
      description = 'The public verification answer for one certificate.';
      // a certificate's recipient is a customer relationship
      robots = 'noindex, nofollow';
    } else if (path === '/login') { title = 'Sign in — Ravel'; description = 'Sign in to the Ravel console.'; robots = 'noindex'; }
    else if (path.startsWith('/console')) { title = 'Console — Ravel'; description = 'The operational record and the issued artefacts.'; robots = 'noindex'; }
    document.title = title;
    setMeta('description', description);
    setMeta('robots', robots);
  }, [path]);

  // /console and everything under it redirect an anonymous reader to /login
  useEffect(() => {
    if (path.startsWith('/console') && !user) navigate('/login', { replace: true });
  }, [path, user]);

  if (verifyParams) {
    return <Shell public><Verify number={verifyParams.number} /></Shell>;
  }
  if (path === '/login') {
    return <Shell public><Login /></Shell>;
  }
  if (publicHit) {
    const Component = publicHit[1];
    return <Shell public><Component /></Shell>;
  }
  if (path.startsWith('/console')) {
    if (!user) return <Shell public><Login /></Shell>;
    if (consoleHit) {
      const { Component, params, pattern } = consoleHit;
      return <Shell user={user}><Component {...params} pattern={pattern} /></Shell>;
    }
    return (
      <Shell user={user}>
        <div className="page section">
          <h2>No such console surface</h2>
          <p>The address <span className="mono">{path}</span> does not name a surface in this console.</p>
          <Link href="/console" className="button">Back to the board</Link>
        </div>
      </Shell>
    );
  }
  return (
    <Shell public>
      <div className="page section">
        <h2>No such page</h2>
        <p>The address <span className="mono">{path}</span> does not name a page on this site.</p>
        <Link href="/" className="button">Back to the home page</Link>
      </div>
    </Shell>
  );
}

function setMeta(name, content) {
  let tag = document.head.querySelector(`meta[name="${name}"]`);
  if (!content) { if (tag) tag.remove(); return; }
  if (!tag) { tag = document.createElement('meta'); tag.setAttribute('name', name); document.head.appendChild(tag); }
  tag.setAttribute('content', content);
}

// The chrome is one persistent top bar and one footer, identical on every route.
function Shell({ children, user, public: isPublic }) {
  const path = usePath();
  return (
    <>
      <a className="skip-link" href="#main">Skip to the main content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href={isPublic ? '/' : '/console'} className="wordmark">Ravel</Link>
          {isPublic ? (
            <nav className="nav" aria-label="Site">
              <Link href="/product" aria-current={path === '/product' ? 'page' : undefined}>Product</Link>
              <Link href="/technology" aria-current={path === '/technology' ? 'page' : undefined}>Technology</Link>
              <Link href="/about" aria-current={path === '/about' ? 'page' : undefined}>About</Link>
              <Link href="/careers" aria-current={path === '/careers' ? 'page' : undefined}>Careers</Link>
              <Link href="/news" aria-current={path === '/news' ? 'page' : undefined}>News</Link>
              <Link href="/contact" aria-current={path === '/contact' ? 'page' : undefined}>Contact</Link>
              <span className="spacer" />
              <Link href="/login">Console</Link>
            </nav>
          ) : (
            <nav className="nav" aria-label="Console">
              <Link href="/console" aria-current={path === '/console' ? 'page' : undefined}>Board</Link>
              <Link href="/console/intake" aria-current={path.startsWith('/console/intake') ? 'page' : undefined}>Intake</Link>
              <Link href="/console/balance" aria-current={path.startsWith('/console/balance') ? 'page' : undefined}>Balance</Link>
              <Link href="/console/lots" aria-current={path.startsWith('/console/lots') ? 'page' : undefined}>Lots</Link>
              <Link href="/console/certificates" aria-current={path.startsWith('/console/certificates') ? 'page' : undefined}>Certificates</Link>
              <Link href="/console/reconciliation" aria-current={path.startsWith('/console/reconciliation') ? 'page' : undefined}>Reconciliation</Link>
              <Link href="/console/record" aria-current={path.startsWith('/console/record') ? 'page' : undefined}>Record</Link>
              <Link href="/console/collectors" aria-current={path.startsWith('/console/collectors') ? 'page' : undefined}>Collectors</Link>
              <span className="spacer" />
              <span className="t-eyebrow" style={{ color: 'var(--muted)', textTransform: 'none', letterSpacing: 0 }}>
                {user?.name} · {(user?.roles || []).join(', ').replace(/_/g, ' ')}
              </span>
              <button
                type="button"
                className="button"
                style={{ padding: '0.35rem 0.65rem' }}
                onClick={() => { clearSession(); navigate('/login'); }}
              >
                Sign out
              </button>
            </nav>
          )}
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="footer">
        <div className="page">
          <div className="grid grid-3">
            <div>
              <p className="t-small" style={{ marginBottom: '0.25rem' }}>Ravel Materials SAS</p>
              <p className="t-small" style={{ color: 'var(--muted)' }}>
                14 rue des Fabriques, 69007 Lyon, France
              </p>
            </div>
            <div>
              <p className="t-small" style={{ marginBottom: '0.25rem' }}>
                <Link href="/privacy">Privacy and retention</Link>
              </p>
              <p className="t-small" style={{ color: 'var(--muted)' }}>
                Disclosure: security@example.com
              </p>
            </div>
            <div>
              <p className="t-small" style={{ color: 'var(--muted)' }}>
                A certificate is verified at ravel.example.com/verify/&#123;number&#125;, with no account.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
