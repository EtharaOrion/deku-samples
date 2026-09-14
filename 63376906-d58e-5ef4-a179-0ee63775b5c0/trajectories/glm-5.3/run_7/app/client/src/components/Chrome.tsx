import { Link } from '../router';

export function TopBar({ current }: { current: string }) {
  const isConsole = current.startsWith('/console') || current.startsWith('/login');
  const links = isConsole
    ? [
        ['/console', 'Board'],
        ['/console/balance', 'Balance'],
        ['/console/lots', 'Lots'],
        ['/console/certificates', 'Certificates'],
        ['/console/record', 'Record'],
        ['/console/reconciliation', 'Reconciliation'],
        ['/console/collectors', 'Collectors'],
        ['/console/contracts', 'Contracts']
      ]
    : [
        ['/product', 'Product'],
        ['/technology', 'Technology'],
        ['/about', 'About'],
        ['/careers', 'Careers'],
        ['/news', 'News'],
        ['/contact', 'Contact']
      ];
  return (
    <header class="topbar">
      <div class="topbar-inner">
        <a class="wordmark" href={isConsole ? '/console' : '/'} aria-label="Ravel home">
          {isConsole ? <span>Ravel <span class="label">console</span></span> : 'Ravel'}
        </a>
        <nav class="topnav" aria-label={isConsole ? 'Console' : 'Site'}>
          {links.map(([href, label]) => (
            <Link href={href} aria-current={current === href || (href !== '/' && current.startsWith(href)) ? 'page' : undefined}>
              {label}
            </Link>
          ))}
          {isConsole ? <Link href="/">Public site</Link> : <Link href="/console">Console</Link>}
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer class="site-footer">
      <div class="shell footer-grid">
        <div>
          <p class="label">Ravel Materials SAS</p>
          <p class="measure">Virgin-quality recycled polyamide. Lyon, France.</p>
        </div>
        <div>
          <p class="label">Register</p>
          <p><Link href="/privacy">Privacy policy</Link></p>
          <p><a href="/verify/">Verify a certificate</a></p>
        </div>
        <div>
          <p class="label">Contact</p>
          <p><Link href="/contact">Enquiries</Link></p>
          <p><a href="mailto:security@example.com">security@example.com</a></p>
        </div>
      </div>
    </footer>
  );
}
