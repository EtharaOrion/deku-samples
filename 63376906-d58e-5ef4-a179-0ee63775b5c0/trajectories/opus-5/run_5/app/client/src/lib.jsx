import { useEffect, useState, useRef, useCallback } from 'preact/hooks';

/* ------------------------------------------------------------------ router */

const listeners = new Set();

export function navigate(to, replace = false) {
  if (replace) history.replaceState({}, '', to);
  else history.pushState({}, '', to);
  for (const l of listeners) l();
  window.scrollTo(0, 0);
}

export function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  return path;
}

export function Link({ href, children, class: cls, ...rest }) {
  const onClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} class={cls} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}

/* -------------------------------------------------------------- session */

const TOKEN_KEY = 'ravel.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage may be unavailable */
  }
}

let keyCounter = 0;
export function idempotencyKey(prefix = 'ui') {
  keyCounter += 1;
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Math.random()}`;
  return `${prefix}-${rand}-${keyCounter}`;
}

export async function api(path, { method = 'GET', body, key } = {}) {
  const headers = { 'content-type': 'application/json' };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (method !== 'GET') headers['Idempotency-Key'] = key || idempotencyKey();
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const err = new Error(json?.detail || json?.error || `Request failed with ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export function useApi(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const reload = useCallback(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    if (!path) {
      setState({ loading: false, data: null, error: null });
      return () => {};
    }
    api(path)
      .then((data) => live && setState({ loading: false, data, error: null }))
      .catch((error) => live && setState({ loading: false, data: null, error }));
    return () => {
      live = false;
    };
  }, [path]);
  useEffect(() => reload(), [path, ...deps]);
  return { ...state, reload };
}

/* ---------------------------------------------------------------- format */

// Nothing animates a number as it changes, because a percentage that counts up
// is briefly wrong. These are plain formatters.
export function grams(n) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toLocaleString('en-GB')} g`;
}
export function kg(n) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toLocaleString('en-GB')} kg`;
}
export function kwh(n) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toLocaleString('en-GB')} kWh`;
}
export function bp(n) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toLocaleString('en-GB')} bp`;
}
export function bpAsPercent(n) {
  if (n === null || n === undefined) return '—';
  const whole = Math.floor(n / 100);
  const frac = String(Math.abs(n) % 100).padStart(2, '0');
  return `${whole}.${frac}%`;
}
export function mgPerKg(n) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toLocaleString('en-GB')} mg/kg`;
}
export function words(s) {
  if (!s) return '';
  return String(s).replace(/_/g, ' ');
}
export function dateOf(s) {
  if (!s) return '—';
  return String(s).slice(0, 10);
}

/* -------------------------------------------------------------- reveal */

export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // No element that a reveal governs stays hidden if the reader never
    // scrolls to it: it resolves on a timer as well as on intersection.
    const resolve = () => el.classList.add('resolved');
    if (typeof IntersectionObserver === 'undefined') {
      resolve();
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) { resolve(); io.disconnect(); }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    const timer = setTimeout(() => { resolve(); io.disconnect(); }, 900);
    return () => { clearTimeout(timer); io.disconnect(); };
  }, []);
  return ref;
}

export function Reveal({ children, as: Tag = 'div', class: cls = '', ...rest }) {
  const ref = useReveal();
  return (
    <Tag ref={ref} class={`reveal ${cls}`} {...rest}>
      {children}
    </Tag>
  );
}

/* -------------------------------------------------------------- metadata */

export function useMeta(title, description, noindex = false) {
  useEffect(() => {
    document.title = title;
    let d = document.querySelector('meta[name="description"]');
    if (!d) {
      d = document.createElement('meta');
      d.setAttribute('name', 'description');
      document.head.appendChild(d);
    }
    d.setAttribute('content', description);
    let r = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (!r) {
        r = document.createElement('meta');
        r.setAttribute('name', 'robots');
        document.head.appendChild(r);
      }
      r.setAttribute('content', 'noindex, nofollow');
    } else if (r) {
      r.remove();
    }
  }, [title, description, noindex]);
}
