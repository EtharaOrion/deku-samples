import { h } from 'preact';
import { Link, useRouter } from './lib/router.jsx';
import { getToken, clearToken } from './lib/api.js';

const PUBLIC = [['/', 'Home'], ['/product', 'Product'], ['/technology', 'Technology'], ['/about', 'About'], ['/careers', 'Careers'], ['/news', 'News'], ['/contact', 'Contact'], ['/privacy', 'Privacy']];
const CONSOLE = [['/console', 'Board'], ['/console/intake', 'Intake'], ['/console/record', 'Record'], ['/console/reconciliation', 'Reconciliation'], ['/console/certificates', 'Certificates'], ['/console/balance', 'Balance']];

export function TopBar({ authed, console: isConsole }) {
  const { path } = useRouter();
  const items = isConsole ? CONSOLE : PUBLIC;
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-inner' },
      h(Link, { href: '/', class: 'brand', 'aria-label': 'Ravel home' }, 'RAVEL'),
      h('nav', { class: 'nav', 'aria-label': isConsole ? 'Console' : 'Site' },
        items.map(([to, label]) => h(Link, { href: to, key: to, 'aria-current': (to === '/' ? path === '/' : path.startsWith(to)) ? 'page' : null }, label))),
      h('div', { style: 'margin-left:auto;display:flex;gap:.75rem;align-items:center' },
        authed
          ? h(Link, { href: '/console', class: 'btn' }, 'Console')
          : h(Link, { href: '/login', class: 'btn' }, 'Sign in'),
        isConsole && authed ? h('button', {
          class: 'btn', onClick: () => { clearToken(); location.href = '/'; },
        }, 'Sign out') : null)));
}

export function SiteFoot({ console: isConsole }) {
  return h('footer', { class: 'sitefoot' },
    h('div', { class: 'shell', style: 'display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between' },
      h('p', null, 'Ravel Materials SAS · Lyon, France'),
      h('nav', { 'aria-label': 'Footer', class: 'nav' },
        h(Link, { href: '/privacy', class: 'underline' }, 'Privacy'),
        h(Link, { href: '/contact', class: 'underline' }, 'Contact'),
        h(Link, { href: '/verify/CERT-PILOT-000001', class: 'underline' }, 'Verify a certificate'))));
}
