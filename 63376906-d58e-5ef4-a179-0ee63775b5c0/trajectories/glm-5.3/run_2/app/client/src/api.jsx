import { h } from "preact";
import { useEffect, useState, useRef } from "preact/hooks";

export const API = "/api";

let tokenStore = null;
export function getToken() {
  if (tokenStore) return tokenStore;
  try { tokenStore = sessionStorage.getItem("ravel_token") || null; } catch { tokenStore = null; }
  return tokenStore;
}
export function setToken(t) {
  tokenStore = t;
  try { t ? sessionStorage.setItem("ravel_token", t) : sessionStorage.removeItem("ravel_token"); } catch {}
}

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && typeof opts.body !== "string") {
    opts = { ...opts, body: JSON.stringify(opts.body) };
    headers["content-type"] = "application/json";
  }
  const t = getToken();
  if (t) headers["authorization"] = `Bearer ${t}`;
  if (opts.method && opts.method !== "GET") {
    headers["idempotency-key"] = opts.idempotency_key || crypto.randomUUID();
  }
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const err = new Error(body?.error || `request_failed_${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export function useApi(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const load = () => {
    if (!path) { setState({ loading: false, data: null, error: null }); return; }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api(path).then(
      (data) => alive && setState({ loading: false, data, error: null }),
      (error) => alive && setState({ loading: false, data: null, error })
    );
    return () => { alive = false; };
  };
  useEffect(load, deps);
  return { ...state, reload: load };
}

// The reveal resolves from a blur as the reader arrives, and is readable before
// the resolve finishes.
export function Reveal({ as: Tag = "h2", children, ...props }) {
  const ref = useRef(null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setResolved(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { setResolved(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    const t = setTimeout(() => setResolved(true), 1200);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return h(Tag, { ref, class: `reveal${resolved ? " resolved" : ""}`, ...props }, children);
}

export const fmtG = (g) => (g === null || g === undefined ? "—" : `${Number(g).toLocaleString("en-GB")} g`);
export const fmtBP = (bp) => (bp === null || bp === undefined ? "—" : `${Number(bp) / 100} per cent`);
export const fmtMg = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("en-GB")} mg CO2e per kg`);
export const dateOnly = (v) => (v ? String(v).slice(0, 10) : "—");

export function Words({ children }) {
  return <span class="word">{children}</span>;
}

export function Empty({ children }) {
  return <p class="body-regular">{children}</p>;
}

export function Loading({ children = "Loading…" }) {
  return <p class="body-regular" aria-busy="true">{children}</p>;
}

export function Banner({ refusal, children }) {
  return (
    <div class={`banner${refusal ? " refusal" : ""}`} role={refusal ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function DocMeta({ title, description }) {
  useEffect(() => {
    document.title = title;
    let m = document.querySelector('meta[name="description"]');
    if (!m) {
      m = document.createElement("meta");
      m.setAttribute("name", "description");
      document.head.appendChild(m);
    }
    m.setAttribute("content", description);
  }, [title, description]);
  return null;
}

export function NoIndex() {
  useEffect(() => {
    let m = document.querySelector('meta[name="robots"]');
    if (!m) {
      m = document.createElement("meta");
      m.setAttribute("name", "robots");
      document.head.appendChild(m);
    }
    m.setAttribute("content", "noindex");
  }, []);
  return null;
}

// A tiny router: internal navigation only, one listener.
export function navigate(href) {
  history.pushState({}, "", href);
  window.dispatchEvent(new Event("ravel:nav"));
}
export function Link({ href, children, class: cls, ...rest }) {
  return (
    <a
      href={href}
      class={cls}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(href);
      }}
    >{children}</a>
  );
}
