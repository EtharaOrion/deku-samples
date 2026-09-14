// A tiny router: hash-free paths served by the same static shell.
import { useState, useEffect } from 'preact/hooks';

let listeners: ((path: string) => void)[] = [];

export function currentPath(): string {
  return window.location.pathname;
}

export function navigate(to: string, replace = false) {
  if (replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);
  listeners.forEach((l) => l(window.location.pathname));
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    listeners.push(setPath);
    return () => {
      window.removeEventListener('popstate', onPop);
      listeners = listeners.filter((l) => l !== setPath);
    };
  }, []);
  return path;
}

export function Link(props: any) {
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(props.href);
  };
  const { href, children, ...rest } = props;
  return (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}
