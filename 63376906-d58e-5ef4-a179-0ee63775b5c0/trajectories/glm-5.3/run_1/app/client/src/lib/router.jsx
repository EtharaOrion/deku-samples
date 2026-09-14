import { h, createContext } from 'preact';
import { useEffect, useState, useContext } from 'preact/hooks';

const RouteCtx = createContext({ path: '/' });
export const useRoute = () => useContext(RouteCtx);

const listeners = new Set();
let current = normalize(window.location.pathname);

function normalize(p) {
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p || '/';
}

export function navigate(to) {
  window.history.pushState({}, '', to);
  current = normalize(to);
  listeners.forEach((l) => l(current));
  // also notify through popstate so a navigation raised inside a child effect
  // before the router has subscribed is still seen
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function Router({ children }) {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const onPop = () => { current = normalize(window.location.pathname); setPath(current); };
    const onPush = (p) => setPath(p);
    window.addEventListener('popstate', onPop);
    listeners.add(onPush);
    return () => { window.removeEventListener('popstate', onPop); listeners.delete(onPush); };
  }, []);
  let matched = null;
  for (const child of Array.isArray(children) ? children : [children]) {
    if (!child || !child.props) continue;
    const { path: pattern, exact: exactProp = false } = child.props || {};
    const m = match(pattern, path);
    if (m) {
      matched = { child, params: m };
      break;
    }
  }
  return h(RouteCtx.Provider, { value: { path, params: matched ? matched.params : {} } },
    matched ? [matched.child.props.meta, h(matched.child.props.component, { params: matched.params, path })] : h('main', null, h('h1', null, 'Not found')));
}

function match(pattern, path) {
  if (pattern === '*') return {};
  if (!pattern.includes(':')) {
    return pattern === path ? {} : null;
  }
  const pp = pattern.split('/').filter(Boolean);
  const pa = path.split('/').filter(Boolean);
  if (pp.length !== pa.length && !pattern.includes('*')) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    const seg = pp[i];
    if (seg.startsWith(':')) {
      if (seg.endsWith('*')) { params[seg.slice(1, -1)] = pa.slice(i).join('/'); return params; }
      if (pa[i] === undefined) return null;
      params[seg.slice(1)] = decodeURIComponent(pa[i]);
    } else if (seg !== pa[i]) return null;
  }
  return Object.keys(params).length || pp.length === pa.length ? params : null;
}

export function Route() { return null; }

export function A({ href, children, ...rest }) {
  return h('a', {
    href,
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(href);
    },
    ...rest
  }, children);
}
