import { h, render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { route } from "./router.mjs";
import { setSession, getSession, api } from "./lib/api.mjs";
import * as home from "./routes/home.mjs";
import * as publicSite from "./routes/public.mjs";
import * as consoleApp from "./routes/console.mjs";
import * as login from "./routes/login.mjs";

const apps = [
  { name: "public", match: ["/", "/product", "/technology", "/about", "/careers", "/news", "/contact", "/privacy", "/verify/:number"], mod: publicSite },
  { name: "home", match: ["/"], mod: home },
  { name: "login", match: ["/login"], mod: login },
  { name: "console", match: ["/console", "/console/:rest*"], mod: consoleApp },
];

function currentPath() { return location.pathname + location.search + location.hash; }

function App() {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const on = () => setPath(currentPath());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const pathname = path.split("?")[0].split("#")[0];

  let chosen = null;
  for (const a of apps) {
    for (const p of a.match) {
      const params = matchPath(p, pathname);
      if (params) { chosen = { app: a, params }; break; }
    }
    if (chosen) break;
  }
  if (!chosen) chosen = { app: apps.find((a) => a.name === "public"), params: { notFound: true } };
  const C = chosen.app.mod.default;
  return h(C, { path: pathname, params: chosen.params, navigate: route });
}

function matchPath(pattern, pathname) {
  const pp = pattern.split("/").filter(Boolean);
  const ap = pathname.split("/").filter(Boolean);
  const out = {};
  let i = 0;
  for (; i < pp.length; i++) {
    const seg = pp[i];
    if (seg.startsWith(":")) {
      const name = seg.slice(1).replace(/\*$/, "");
      if (seg.endsWith("*")) { out[name] = "/" + ap.slice(i).join("/"); return out; }
      if (i >= ap.length) return null;
      out[name] = decodeURIComponent(ap[i]);
    } else {
      if (ap[i] !== seg) return null;
    }
  }
  if (ap.length !== pp.length) return null;
  return out;
}

function start() {
  const stored = sessionStorage.getItem("ravel.session") || localStorage.getItem("ravel.session");
  if (stored) { try { setSession(JSON.parse(stored)); } catch {} }
  render(h(App, null), document.getElementById("app"));
}
start();
