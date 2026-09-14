// A hash-free router for a served SPA: history pushState with popstate.
import { useEffect, useState } from 'preact/hooks';

const listeners = new Set();

export function navigate(path) {
  history.pushState({}, '', path);
  for (const l of listeners) l(path);
}

export function usePath() {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    listeners.add(setPath);
    window.addEventListener('popstate', on);
    return () => {
      listeners.delete(setPath);
      window.removeEventListener('popstate', on);
    };
  }, []);
  return path;
}

export function Link({ href, children, class: cls, current, ...rest }) {
  return (
    <a
      href={href}
      class={cls}
      aria-current={current ? (current === true ? 'page' : current) : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    >{children}</a>
  );
}
