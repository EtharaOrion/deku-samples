import { e as createComponent, m as maybeRenderHead, g as addAttribute, r as renderTemplate, k as renderComponent, l as renderScript, h as createAstro, n as Fragment, o as renderSlot } from './astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { $ as $$Base } from './Base_DrlgOIIb.mjs';
import { useState, useEffect } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { e as readSession, g as readCartToken, a as apiGet } from './api_D4zreuKm.mjs';

const $$Astro$1 = createAstro();
const $$Rail = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$Rail;
  const { path = "/", signedIn = false } = Astro2.props;
  const primary = [
    { href: "/shop", label: "Shop" },
    { href: "/downloads", label: "Downloads" },
    { href: "/doctor", label: "Firmware installer" }
  ];
  const account = [
    { href: "/account", label: "Overview", exact: true },
    { href: "/account/orders", label: "Orders" },
    { href: "/account/cameras", label: "Cameras" }
  ];
  function current(href, exact) {
    if (exact) return path === href;
    return path === href || path.startsWith(href + "/");
  }
  return renderTemplate`${maybeRenderHead()}<nav class="rail" aria-label="Sections" data-rail> <button type="button" class="rail-toggle" aria-expanded="false" aria-controls="rail-body" data-rail-toggle> <span aria-hidden="true">☰</span> <span>Sections</span> </button> <div class="rail-body" id="rail-body"> <div class="rail-group"> <h2 class="rail-heading" id="rail-browse">Browse</h2> <ul style="list-style:none;padding:0;margin:0" aria-labelledby="rail-browse"> ${primary.map((item) => renderTemplate`<li> <a class="rail-link"${addAttribute(item.href, "href")}${addAttribute(current(item.href, item.exact) ? "page" : void 0, "aria-current")}> <span class="rail-marker" aria-hidden="true">${current(item.href, item.exact) ? "\u25B8" : ""}</span> <span>${item.label}</span> </a> </li>`)} </ul> </div> ${signedIn && renderTemplate`<div class="rail-group"> <h2 class="rail-heading" id="rail-account">Your account</h2> <ul style="list-style:none;padding:0;margin:0" aria-labelledby="rail-account"> ${account.map((item) => renderTemplate`<li> <a class="rail-link"${addAttribute(item.href, "href")}${addAttribute(current(item.href, item.exact) ? "page" : void 0, "aria-current")}> <span class="rail-marker" aria-hidden="true">${current(item.href, item.exact) ? "\u25B8" : ""}</span> <span>${item.label}</span> </a> </li>`)} </ul> </div>`} <div class="rail-group"> <h2 class="rail-heading" id="rail-session">Session</h2> <ul style="list-style:none;padding:0;margin:0" aria-labelledby="rail-session"> ${signedIn ? renderTemplate`<li> <form method="post" action="/sign-out"> <button type="submit" class="rail-link" style="width:100%;background:none;border-0;cursor:pointer;font:inherit;text-align:start;border:0;border-left:3px solid transparent">
Sign out
</button> </form> </li>` : renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <li> <a class="rail-link" href="/sign-in"${addAttribute(path === "/sign-in" ? "page" : void 0, "aria-current")}> <span class="rail-marker" aria-hidden="true">${path === "/sign-in" ? "\u25B8" : ""}</span> <span>Sign in</span> </a> </li> <li> <a class="rail-link" href="/sign-up"${addAttribute(path === "/sign-up" ? "page" : void 0, "aria-current")}> <span class="rail-marker" aria-hidden="true">${path === "/sign-up" ? "\u25B8" : ""}</span> <span>Create an account</span> </a> </li> ` })}`} </ul> </div> </div> </nav> ${renderScript($$result, "/app/src/components/Rail.astro?astro&type=script&index=0&lang.ts")}`;
}, "/app/src/components/Rail.astro", void 0);

// Browser-side helpers. Money stays an integer count of minor units here too.

function readCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(name, value, maxAgeSeconds = 60 * 60 * 24 * 30) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}
const CART_COOKIE = 'vela_cart';
const SESSION_COOKIE = 'vela_session';
function cartToken() {
  return readCookie(CART_COOKIE);
}
function sessionToken() {
  return readCookie(SESSION_COOKIE);
}

/** Call the app's own API. Errors carry a code, a message and the request id. */
async function api(path, {
  method = 'GET',
  body,
  headers = {},
  auth = false
} = {}) {
  const token = cartToken();
  const session = sessionToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : {
        'content-type': 'application/json'
      }),
      ...(token ? {
        'x-cart-token': token
      } : {}),
      ...(auth && session ? {
        authorization: `Bearer ${session}`
      } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data && data.message || 'That did not work.');
    err.code = data?.code || 'error';
    err.status = res.status;
    err.requestId = data?.request_id || null;
    err.data = data;
    throw err;
  }

  // The cart's opaque token is the only handle a visitor ever holds.
  if (data && data.cart && data.cart.token) writeCookie(CART_COOKIE, data.cart.token);
  return data;
}
function formatMinor(minor) {
  const n = Math.trunc(Number(minor) || 0);
  const neg = n < 0;
  const abs = Math.abs(n);
  return `${neg ? '-' : ''}$${Math.trunc(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}
function announce(message) {
  const region = document.getElementById('live-region');
  if (region) region.textContent = message;
}

/** Broadcast the cart count so the header control keeps up without a reload. */
function publishCartCount(count) {
  window.dispatchEvent(new CustomEvent('vela:cart', {
    detail: {
      count
    }
  }));
}

function CartControl({
  initialCount = 0
}) {
  const [count, setCount] = useState(initialCount);
  useEffect(() => {
    let live = true;
    const onCart = (e) => {
      if (typeof e.detail?.count === "number") setCount(e.detail.count);
    };
    window.addEventListener("vela:cart", onCart);
    api("/cart").then((d) => {
      if (live && d?.cart) setCount(d.cart.item_count || 0);
    }).catch(() => {
    });
    return () => {
      live = false;
      window.removeEventListener("vela:cart", onCart);
    };
  }, []);
  const badge = count > 99 ? "99+" : String(count);
  const name = count === 1 ? "Cart, 1 item" : `Cart, ${count} items`;
  return jsxs("a", {
    href: "/cart",
    class: "btn btn-secondary btn-sm",
    "aria-label": name,
    children: [jsx("span", {
      "aria-hidden": "true",
      children: "Cart"
    }), count > 0 && jsx("span", {
      class: "chip tnum",
      "aria-hidden": "true",
      style: "background:var(--fg);color:var(--bg);border-color:var(--fg)",
      children: badge
    })]
  });
}

const $$Astro = createAstro();
const $$Shell = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Shell;
  const {
    title = "Vela",
    description = "Vela designs, builds and sells two cameras.",
    signedIn = false,
    cartCount = 0
  } = Astro2.props;
  const path = Astro2.url.pathname;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": title, "description": description, "ground": "ground-light" }, { "default": ($$result2) => renderTemplate`  ${maybeRenderHead()}<a class="skip-link" href="#main">Skip to content</a> <div class="shell"> <header class="shell-bar"> <a class="wordmark wordmark-sm" href="/">vela</a> ${renderComponent($$result2, "CartControl", CartControl, { "client:load": true, "initialCount": cartCount, "client:component-hydration": "load", "client:component-path": "/app/src/islands/CartControl.jsx", "client:component-export": "default" })} </header> <div class="shell-rail-wrap"> ${renderComponent($$result2, "Rail", $$Rail, { "path": path, "signedIn": signedIn })} </div> <main class="content" id="main"> ${renderSlot($$result2, $$slots["default"])} </main> </div> ` })}`;
}, "/app/src/layouts/Shell.astro", void 0);

/**
 * Resolve the viewer for a server-rendered page: the signed-in customer if the
 * token is good, and the cart count for the header control.
 */
async function viewer(Astro) {
  const token = readSession(Astro);
  const cartToken = readCartToken(Astro);
  let customer = null;
  if (token) {
    const me = await apiGet(Astro.request, '/auth/me', {
      token
    });
    if (me.ok) customer = me.data.customer;
  }
  let cartCount = 0;
  if (cartToken) {
    const cart = await apiGet(Astro.request, '/cart', {
      cartToken
    });
    if (cart.ok) cartCount = cart.data.cart.item_count || 0;
  }
  return {
    token,
    cartToken,
    customer,
    signedIn: Boolean(customer),
    cartCount
  };
}

/**
 * A signed-out request for an /account route lands on /sign-in carrying the
 * intended path, and returns there after signing in.
 */
function signInRedirect(Astro) {
  const next = Astro.url.pathname + (Astro.url.search || '');
  return Astro.redirect(`/sign-in?next=${encodeURIComponent(next)}`, 302);
}

export { $$Shell as $, api as a, announce as b, formatMinor as f, publishCartCount as p, signInRedirect as s, viewer as v };
