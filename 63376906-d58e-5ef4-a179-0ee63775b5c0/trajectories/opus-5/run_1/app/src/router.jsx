import { useState, useEffect, useCallback } from 'preact/hooks';

const listeners = new Set();

export function navigate(to, replace = false) {
  if (replace) history.replaceState({}, '', to);
  else history.pushState({}, '', to);
  listeners.forEach((fn) => fn(to));
  window.scrollTo(0, 0);
}

export function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname);
    listeners.add(onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);
  return path;
}

export function Link({ href, children, class: cls, ...rest }) {
  const onClick = useCallback((e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  }, [href]);
  return (
    <a href={href} class={cls} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}

// Matches /a/:x/b against a path, returning params or null.
export function match(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const q = path.split('/').filter(Boolean);
  if (p.length !== q.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(q[i]);
    else if (p[i] !== q[i]) return null;
  }
  return params;
}
