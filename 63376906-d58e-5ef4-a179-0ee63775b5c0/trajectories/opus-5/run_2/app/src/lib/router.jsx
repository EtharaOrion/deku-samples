import { useEffect, useState } from 'preact/hooks';

const listeners = new Set();

export function navigate(to, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', to);
  else history.pushState({}, '', to);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

export function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => { listeners.delete(update); window.removeEventListener('popstate', update); };
  }, []);
  return path;
}

// Matches '/console/lots/:reference/genealogy' style patterns.
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

export function Link({ href, children, ...rest }) {
  const onClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={onClick} {...rest}>{children}</a>;
}

// Every route carries its own metadata: a title and a description written for
// that route.
export function useMeta(title, description, { noindex = false } = {}) {
  useEffect(() => {
    document.title = title;
    let d = document.querySelector('meta[name="description"]');
    if (!d) { d = document.createElement('meta'); d.name = 'description'; document.head.appendChild(d); }
    d.content = description;
    let r = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (!r) { r = document.createElement('meta'); r.name = 'robots'; document.head.appendChild(r); }
      r.content = 'noindex';
    } else if (r) {
      r.remove();
    }
  }, [title, description, noindex]);
}
