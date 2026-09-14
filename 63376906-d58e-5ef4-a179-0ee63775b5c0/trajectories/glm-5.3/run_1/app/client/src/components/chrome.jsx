import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { A } from '../lib/router.jsx';
import { getToken, clearToken } from '../lib/api.js';

export function Reveal({ as: Tag = 'div', children, className = '', ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.add('in'); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); }
    }, { rootMargin: '0px' });
    io.observe(el);
    // nothing stays hidden if the reader never scrolls to it
    const t = setTimeout(() => el.classList.add('in'), 900);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return h(Tag, { ref, className: 'reveal ' + className, ...rest }, children);
}

export function Word({ kind, children, className = '' }) {
  return h('span', { class: 'word word-' + (kind || 'note') + ' ' + className }, children);
}

export function TopBar({ console: isConsole, path }) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (!getToken()) return;
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + getToken() } })
      .then((r) => r.json()).then(setMe).catch(() => {});
  }, [path]);
  const links = isConsole
    ? [['/console', 'Board'], ['/console/intake', 'Intake'], ['/console/record', 'Record'], ['/console/reconciliation', 'Reconciliation'], ['/console/certificates', 'Certificates'], ['/console/balance', 'Balance']]
    : [['/', 'Home'], ['/product', 'Product'], ['/technology', 'Technology'], ['/about', 'About'], ['/careers', 'Careers'], ['/news', 'News'], ['/contact', 'Contact']];
  return (
    h('header', { class: 'topbar' },
      h('div', { class: 'topbar-inner' },
        h(A, { href: isConsole ? '/console' : '/', class: 'wordmark', 'aria-label': 'Ravel home' }, 'Ravel'),
        h('nav', { class: 'nav', 'aria-label': isConsole ? 'Console sections' : 'Site' },
          links.map(([href, label]) => h(A, { href, 'aria-current': path === href ? 'page' : null }, label)),
          !isConsole ? h(A, { href: '/console' }, 'Console') : null,
          me ? h('span', { class: 'label' }, me.email) : null,
          getToken() ? h('button', { class: 'linklike', onClick: () => { clearToken(); location.href = '/'; } }, 'Sign out') : null
        )
      )
    )
  );
}

export function Footer() {
  return h('footer', null,
    h('div', { class: 'inner' },
      h('div', null, h('p', { class: 'label' }, 'Ravel Materials SAS'), h('p', { class: 'body-small' }, 'Chemical recycling of nylon. Lyon, France.')),
      h('div', null,
        h('p', { class: 'label' }, 'Verify'),
        h('p', { class: 'body-small' }, 'Verify this certificate at ravel.example.com/verify/{number}.')
      ),
      h('div', null, h(A, { href: '/privacy', class: 'body-small' }, 'Privacy'), h('p', { class: 'body-small' }, 'security@example.com'))
    )
  );
}

// A recycled-content percentage renders with its claim type. A carbon figure with its boundary,
// method version and uncertainty. A capacity figure with its confidence.
export function FigurePair({ main, note, unit }) {
  return h('div', { class: 'figure-pair' },
    h('span', { class: 'figure-main' }, main, unit ? h('span', { class: 'figure-note' }, ' ' + unit) : null),
    note ? h('span', { class: 'figure-note' }, note) : null
  );
}

export function Loading() { return h('p', { class: 'body-regular', role: 'status' }, 'Loading…'); }

export function Empty({ children }) {
  return h('p', { class: 'body-regular' }, children || 'There is nothing here yet.');
}

export function Banner({ title, children }) {
  return h('div', { class: 'banner', role: 'alert' },
    title ? h('p', { class: 'label' }, title) : null,
    h('p', { class: 'body-regular' }, children)
  );
}

// interface marks, drawn as inline vectors with a text label beside each
export function IconFlag() { return h('svg', { width: '16', height: '16', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, h('path', { d: 'M3 1v14', stroke: 'currentColor', 'stroke-width': '1.5' }), h('path', { d: 'M3 2h9l-2 3 2 3H3z', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' })); }
export function IconLock() { return h('svg', { width: '16', height: '16', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, h('rect', { x: '3', y: '7', width: '10', height: '7', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' }), h('path', { d: 'M5 7V5a3 3 0 016 0v2', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' })); }
export function IconArrow() { return h('svg', { width: '16', height: '16', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, h('path', { d: 'M2 8h11M9 4l4 4-4 4', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' })); }
export function IconWarn() { return h('svg', { width: '16', height: '16', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, h('path', { d: 'M8 2l6.5 12h-13z', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' }), h('path', { d: 'M8 6.5v3.5M8 12v.01', stroke: 'currentColor', 'stroke-width': '1.5' })); }
