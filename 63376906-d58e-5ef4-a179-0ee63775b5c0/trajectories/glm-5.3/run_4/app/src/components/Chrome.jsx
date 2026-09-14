import { Link } from 'preact-router';

export function TopBar({ consoleMode, user, onSignOut }) {
  return (
    <header class="topbar">
      <a class="brand" href={consoleMode ? '/console' : '/'}>
        <span class="brand-mark" aria-hidden="true">R</span>
        <span class="brand-name">Ravel</span>
      </a>
      <nav class="topnav" aria-label={consoleMode ? 'Console sections' : 'Site sections'}>
        {consoleMode ? (
          <>
            <Link class="topnav-link" href="/console">Board</Link>
            <Link class="topnav-link" href="/console/intake">Intake</Link>
            <Link class="topnav-link" href="/console/record">Record</Link>
            <Link class="topnav-link" href="/console/reconciliation">Reconciliation</Link>
            <Link class="topnav-link" href="/console/certificates">Certificates</Link>
            <span class="topnav-who">{user ? user.email : ''}</span>
            <button class="btn btn-quiet" type="button" onClick={onSignOut}>Sign out</button>
          </>
        ) : (
          <>
            <Link class="topnav-link" href="/product">Product</Link>
            <Link class="topnav-link" href="/technology">Technology</Link>
            <Link class="topnav-link" href="/about">About</Link>
            <Link class="topnav-link" href="/careers">Careers</Link>
            <Link class="topnav-link" href="/news">News</Link>
            <Link class="topnav-link" href="/contact">Contact</Link>
            <Link class="topnav-link" href="/console">Console</Link>
          </>
        )}
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer class="footer">
      <div class="footer-inner">
        <p class="footer-line">Ravel Materials SAS · Lyon, France</p>
        <p class="footer-line">Verify a certificate at <span class="mono">ravel.example.com/verify/&#123;number&#125;</span></p>
        <nav class="footer-nav" aria-label="Footer">
          <Link href="/privacy">Privacy</Link>
          <Link href="/contact">Contact</Link>
        </nav>
      </div>
    </footer>
  );
}

export function Empty({ children }) {
  return <p class="empty">There is nothing here yet. {children}</p>;
}
export function Loading({ children }) {
  return <p class="loading" role="status">{children || 'Loading…'}</p>;
}
export function Banner({ kind, children }) {
  return <div class={'banner banner-' + (kind || 'refused')} role="alert">{children}</div>;
}
