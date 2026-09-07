import { useEffect, useState, useCallback } from 'preact/hooks';

/** A small router. Every route in this product has its own address, including
 *  each of the four certificate wizard steps, because a step a reader cannot
 *  link to is a step they cannot return to. */

let listeners = new Set();

export function navigate(to, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', to);
  else history.pushState({}, '', to);
  for (const l of listeners) l();
  window.scrollTo(0, 0);
}

export function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);
  const update = useCallback(() => setPath(window.location.pathname), []);
  useEffect(() => {
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => { listeners.delete(update); window.removeEventListener('popstate', update); };
  }, [update]);
  return path;
}

/** An internal link is an anchor with a real href, so it opens in a new tab,
 *  copies, and reaches the keyboard exactly as any other link does. */
export function Link({ href, children, class: className, ...rest }) {
  const onClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} class={className} onClick={onClick} {...rest}>{children}</a>;
}

/** Match a path against a pattern with :params. */
export function match(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

/** Every route carries its own metadata: a title and a description written for
 *  that route. /verify is excluded from indexing because a certificate's
 *  recipient is a customer relationship. */
export function useMetadata({ title, description, noindex = false }) {
  useEffect(() => {
    document.title = title ? `${title} — Ravel` : 'Ravel';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description || '');

    let robots = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (!robots) {
        robots = document.createElement('meta');
        robots.setAttribute('name', 'robots');
        document.head.appendChild(robots);
      }
      robots.setAttribute('content', 'noindex, nofollow');
    } else if (robots) {
      robots.remove();
    }
  }, [title, description, noindex]);
}
