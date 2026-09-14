import { c as createComponent, e as renderHead, a as addAttribute, r as renderTemplate, d as renderComponent, f as renderSlot, b as createAstro } from "./astro/server_D5JO-_2S.mjs";
import "kleur/colors";
/* empty css                            */
import { useState, useEffect } from "preact/hooks";
import { jsxs, jsx } from "preact/jsx-runtime";
/* empty css                            */
function CartCount({
  initial = 0,
  signedIn = false,
  email = ""
}) {
  const [count, setCount] = useState(initial);
  useEffect(() => {
    const update = async () => {
      try {
        const res = await fetch("/api/cart", {
          credentials: "same-origin"
        });
        if (!res.ok) return;
        const cart = await res.json();
        const n = (cart.lines || []).reduce((a, l) => a + l.quantity, 0);
        setCount(n);
      } catch {
      }
    };
    update();
    const onMsg = (e) => {
      if (e.data === "vela:cart") update();
    };
    window.addEventListener("vela-cart", onMsg);
    window.addEventListener("message", onMsg);
    const interval = setInterval(update, 4e3);
    return () => {
      clearInterval(interval);
      window.removeEventListener("vela-cart", onMsg);
      window.removeEventListener("message", onMsg);
    };
  }, []);
  const label = count === 0 ? "Cart, empty" : `Cart, ${count} item${count === 1 ? "" : "s"}`;
  return jsxs("div", {
    class: "bar-right",
    children: [signedIn ? jsxs("button", {
      class: "btn btn-quiet",
      onClick: async () => {
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin"
          });
        } catch {
        }
        localStorage.removeItem("vela_token");
        document.cookie = "vela_token=; Path=/; Max-Age=0";
        window.location.href = "/";
      },
      children: ["Sign out ", email ? jsxs("span", {
        class: "muted",
        children: ["(", email, ")"]
      }) : null]
    }) : jsx("a", {
      class: "btn btn-quiet",
      href: "/sign-in",
      children: "Sign in"
    }), jsxs("a", {
      class: "btn",
      href: "/cart",
      "aria-label": label,
      children: ["Cart", count > 0 ? jsx("span", {
        class: "badge tnum",
        "aria-hidden": "true",
        children: count > 99 ? "99+" : count
      }) : null]
    })]
  });
}
const $$Astro = createAstro();
const $$App = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$App;
  const { request, url } = Astro2;
  const { currentCustomer, currentCart, cartCount } = await import("./session_C_3CDjrl.mjs");
  const customer = await currentCustomer(request);
  const { state } = await currentCart(request);
  const count = cartCount(state);
  const path = url.pathname;
  const rail = [
    { href: "/shop", label: "Shop", match: (p) => p === "/shop" || p.startsWith("/shop/") },
    { href: "/downloads", label: "Downloads", match: (p) => p === "/downloads" || p.startsWith("/downloads/") && p !== "/downloads" },
    { href: "/doctor", label: "Firmware installer", match: (p) => p === "/doctor" }
  ];
  if (customer) {
    rail.push({ href: "/account", label: "Overview", match: (p) => p === "/account" });
    rail.push({ href: "/account/orders", label: "Orders", match: (p) => p.startsWith("/account/orders") });
    rail.push({ href: "/account/cameras", label: "Cameras", match: (p) => p.startsWith("/account/cameras") });
  }
  const nav = rail.map((r) => ({ ...r, current: !!r.match(path) }));
  const title = Astro2.props.title ?? "Vela";
  return renderTemplate`<html lang="en" data-astro-cid-mnwxwo2t> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>${title} — Vela</title>${renderHead()}</head> <body class="surface-light" data-astro-cid-mnwxwo2t> <a class="skip" href="#main" data-astro-cid-mnwxwo2t>Skip to content</a> <div class="shell" data-astro-cid-mnwxwo2t> <nav class="rail" aria-label="Main" data-astro-cid-mnwxwo2t> <a class="rail-wordmark" href="/" aria-label="Vela home" data-astro-cid-mnwxwo2t>vela</a> ${nav.map((item) => renderTemplate`<a${addAttribute(item.href, "href")}${addAttribute(item.current ? "page" : void 0, "aria-current")}${addAttribute(["rail-link", { current: item.current }], "class:list")} data-astro-cid-mnwxwo2t> <span class="rail-marker" aria-hidden="true" data-astro-cid-mnwxwo2t></span>${item.label} </a>`)} </nav> <div class="content" data-astro-cid-mnwxwo2t> <header class="bar" data-astro-cid-mnwxwo2t> <a class="bar-wordmark" href="/" data-astro-cid-mnwxwo2t>vela</a> ${renderComponent($$result, "CartCount", CartCount, { "client:load": true, "initial": count, "signedIn": !!customer, "email": customer?.email ?? "", "client:component-hydration": "load", "client:component-path": "@components/CartCount.jsx", "client:component-export": "default", "data-astro-cid-mnwxwo2t": true })} </header> <main id="main" class="page" data-astro-cid-mnwxwo2t> ${renderSlot($$result, $$slots["default"])} </main> </div> </div> </body></html>`;
}, "/app/src/layouts/App.astro", void 0);
export {
  $$App as $
};
