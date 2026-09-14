import { useState, useEffect, useCallback } from 'preact/hooks';

const listeners = [];
export function navigate(path) {
  if (window.location.pathname !== path) window.history.pushState({}, '', path);
  listeners.forEach((l) => l(path));
  // defer a popstate so a listener mounted in the same tick still catches the change
  setTimeout(() => {
    try { window.dispatchEvent(new PopStateEvent('popstate')); } catch {}
  }, 0);
}

export function Link({ href, children, class: cls, ...rest }) {
  return (
    <a
      href={href}
      class={cls}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    >{children}</a>
  );
}

export function Router({ routes, shell: Shell }) {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    const onChange = (p) => setPath(p);
    listeners.push(onChange);
    window.addEventListener('popstate', onPop);
    return () => {
      const i = listeners.indexOf(onChange);
      if (i >= 0) listeners.splice(i, 1);
      window.removeEventListener('popstate', onPop);
    };
  }, []);
  const match = useCallback((p) => {
    for (const r of routes) {
      const m = p.match(r.path);
      if (m) return { component: r.component, params: m.slice(1) };
    }
    return null;
  }, [routes]);
  const found = match(path);
  const C = found ? found.component : NotFound;
  const content = <C params={found ? found.params : []} path={path} />;
  if (Shell) return <Shell>{content}</Shell>;
  return content;
}

function NotFound() {
  return (
    <main class="page">
      <h1>There is no page at this address.</h1>
      <p><Link href="/">Return to the home page.</Link></p>
    </main>
  );
}
