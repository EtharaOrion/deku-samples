import { h, createContext } from 'preact';
import { useEffect, useState, useContext } from 'preact/hooks';

const RouterCtx = createContext(null);
export const RouterProvider = ({ children }) => {
  const [path, setPath] = useState(location.pathname + location.search);
  useEffect(() => {
    const on = () => setPath(location.pathname + location.search);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const nav = (to) => { history.pushState(null, '', to); setPath(to); window.scrollTo(0, 0); };
  return h(RouterCtx.Provider, { value: { path, nav } }, children);
};
export const useRouter = () => useContext(RouterCtx);
export function Link({ href, children, class: cls, ...rest }) {
  const { nav } = useRouter();
  return h('a', { href, class: cls, onClick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); nav(href); }, ...rest }, children);
}
export const useRoute = () => useRouter().path;
