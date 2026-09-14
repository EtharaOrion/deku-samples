import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import "./styles.css";
import "./fonts.css";
import { getToken, setToken, api, Link } from "./api.jsx";

import Home from "./routes/home.jsx";
import Product from "./routes/product.jsx";
import Technology from "./routes/technology.jsx";
import About from "./routes/about.jsx";
import Careers from "./routes/careers.jsx";
import News from "./routes/news.jsx";
import Contact from "./routes/contact.jsx";
import Privacy from "./routes/privacy.jsx";
import Verify from "./routes/verify.jsx";
import Login from "./routes/login.jsx";
import Console from "./routes/console.jsx";

const publicLinks = [
  ["/", "Home"], ["/product", "Product"], ["/technology", "Technology"],
  ["/about", "About"], ["/careers", "Careers"], ["/news", "News"],
  ["/contact", "Contact"],
];

function TopBar({ path, session }) {
  return (
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand grotesk" href="/">RAVEL</a>
        <nav class="topnav" aria-label="Site">
          {publicLinks.map(([href, label]) => (
            <Link href={href} aria-current={path === href ? "page" : null}>{label}</Link>
          ))}
          {session ? (
            <Link href="/console" aria-current={path.startsWith("/console") ? "page" : null}>Console</Link>
          ) : (
            <Link href="/login" aria-current={path === "/login" ? "page" : null}>Sign in</Link>
          )}
        </nav>
        {session && (
          <span class="body-small" style="margin-left:auto">
            <span class="mono ref">{session.email}</span>
            {" · "}
            <button class="body-small" onClick={() => { setToken(null); location.href = "/"; }}>Sign out</button>
          </span>
        )}
      </div>
    </header>
  );
}

function routePath(pathname) {
  if (pathname === "/" || pathname === "") return { page: Home, params: {} };
  if (pathname === "/product") return { page: Product, params: {} };
  if (pathname === "/technology") return { page: Technology, params: {} };
  if (pathname === "/about") return { page: About, params: {} };
  if (pathname === "/careers") return { page: Careers, params: {} };
  if (pathname === "/news") return { page: News, params: {} };
  if (pathname === "/contact") return { page: Contact, params: {} };
  if (pathname === "/privacy") return { page: Privacy, params: {} };
  if (pathname === "/login") return { page: Login, params: {} };
  const verify = pathname.match(/^\/verify\/([^/]+)\/?$/);
  if (verify) return { page: Verify, params: { number: verify[1] } };
  if (pathname === "/console" || pathname.startsWith("/console")) {
    return { page: Console, params: { rest: pathname.replace(/^\/console\/?/, "") } };
  }
  return { page: Home, params: {} };
}

export default function App() {
  const [path, setPath] = useState(location.pathname + location.search);
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    const onNav = () => setPath(location.pathname + location.search);
    window.addEventListener("popstate", onNav);
    window.addEventListener("ravel:nav", onNav);
    return () => {
      window.removeEventListener("popstate", onNav);
      window.removeEventListener("ravel:nav", onNav);
    };
  }, []);
  useEffect(() => {
    if (!getToken()) { setSession(null); return; }
    api("/auth/me").then(setSession, () => { setToken(null); setSession(null); });
  }, [path]);

  const pathname = path.split("?")[0];
  const { page: Page, params } = routePath(pathname);
  const anonymousConsole = pathname.startsWith("/console") && session === null;

  useEffect(() => {
    if (anonymousConsole) location.replace("/login");
  }, [anonymousConsole]);

  return (
    <div class="shell">
      <TopBar path={pathname} session={session} />
      <main>
        {anonymousConsole ? (
          <div class="container"><p class="body-regular">Redirecting to sign-in…</p></div>
        ) : (
          <Page {...params} />
        )}
      </main>
      <footer class="site">
        <div class="container">
          <p class="body-small" style="margin:0">
            Ravel Materials SAS · chemical recycling of polyamide · <Link href="/privacy">Privacy</Link> · <Link href="/contact">Contact</Link>
          </p>
          <p class="body-small" style="margin:0">
            Verify a certificate at <span class="mono ref">ravel.example.com/verify/&#123;number&#125;</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
