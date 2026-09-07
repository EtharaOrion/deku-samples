import { useState, useEffect, useCallback } from 'preact/hooks';

const listeners = new Set();

export function navigate(to, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  for (const l of listeners) l(location.pathname + location.search);
  window.scrollTo(0, 0);
}

export function useRoute() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onChange = () => setPath(location.pathname);
    listeners.add(onChange);
    addEventListener('popstate', onChange);
    return () => { listeners.delete(onChange); removeEventListener('popstate', onChange); };
  }, []);
  return path;
}

/** An internal link that keeps the single page a single page. */
export function Link({ href, children, class: cls, ...rest }) {
  const onClick = useCallback((e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  }, [href]);
  return (
    <a href={href} class={cls} onClick={onClick} {...rest}>{children}</a>
  );
}

/**
 * Matches a pattern like /console/lots/:reference/genealogy against a path.
 * Returns the params object, or null.
 */
export function match(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

/** Every route carries its own metadata: a title and a description written for it. */
export function useMeta(title, description, { noindex = false } = {}) {
  useEffect(() => {
    document.title = title ? `${title} — Ravel` : 'Ravel';
    let d = document.querySelector('meta[name="description"]');
    if (!d) { d = document.createElement('meta'); d.name = 'description'; document.head.appendChild(d); }
    d.content = description || '';
    let r = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (!r) { r = document.createElement('meta'); r.name = 'robots'; document.head.appendChild(r); }
      r.content = 'noindex';
    } else if (r) {
      r.remove();
    }
  }, [title, description, noindex]);
}
