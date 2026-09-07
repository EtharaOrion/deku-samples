import { e as createComponent, g as addAttribute, o as renderHead, r as renderTemplate, k as renderComponent, p as renderSlot, h as createAstro, l as Fragment } from './astro/server_CZxa_ltZ.mjs';
import 'piccolore';
/* empty css                            */
import { a as apiFetch } from './api_-Wd5sQnB.mjs';

const $$Astro = createAstro();
const $$Shell = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Shell;
  const { title, current = "", description = "Vela designs, builds and sells two cameras direct." } = Astro2.props;
  const meRes = await apiFetch(Astro2, "/api/auth/me");
  const customer = meRes.status === 200 ? meRes.data.customer : null;
  const cartRes = await apiFetch(Astro2, "/api/cart");
  const cartCount = cartRes.status === 200 ? cartRes.data.item_count : 0;
  const publicNav = [
    { href: "/shop", label: "Shop", key: "shop" },
    { href: "/downloads", label: "Downloads", key: "downloads" },
    { href: "/doctor", label: "Firmware installer", key: "doctor" }
  ];
  const accountNav = [
    { href: "/account", label: "Overview", key: "account" },
    { href: "/account/orders", label: "Orders", key: "orders" },
    { href: "/account/cameras", label: "Cameras", key: "cameras" }
  ];
  const badge = cartCount > 99 ? "99+" : String(cartCount);
  return renderTemplate`<html lang="en"> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — Vela</title><meta name="description"${addAttribute(description, "content")}><link rel="preload" href="/fonts/Archivo-Regular.woff2" as="font" type="font/woff2" crossorigin><link rel="icon" href="/favicon.svg" type="image/svg+xml">${renderHead()}</head> <body class="ground-light"> <a class="skip-link" href="#main">Skip to content</a> <header class="topbar ground-light"> <a class="wordmark" href="/" aria-label="Vela, home"> <span aria-hidden="true">VELA</span> </a> <div class="topbar-right"> ${customer ? renderTemplate`<span class="topbar-who">${customer.email}</span>` : renderTemplate`<a class="topbar-link" href="/sign-in">Sign in</a>`} <a class="cart-control" href="/cart"${addAttribute(`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`, "aria-label")}> <span aria-hidden="true">Cart</span> ${cartCount > 0 && renderTemplate`<span class="cart-badge tnum" aria-hidden="true">${badge}</span>`} </a> </div> </header> <div class="shell"> <details class="rail-toggle"> <summary>Menu</summary> <nav aria-label="Sections, compact"> <ul class="rail-list"> ${publicNav.map((n) => renderTemplate`<li><a${addAttribute(n.href, "href")}${addAttribute(current === n.key ? "page" : void 0, "aria-current")}>${n.label}</a></li>`)} ${customer && accountNav.map((n) => renderTemplate`<li><a${addAttribute(n.href, "href")}${addAttribute(current === n.key ? "page" : void 0, "aria-current")}>${n.label}</a></li>`)} ${customer ? renderTemplate`<li><form method="POST" action="/sign-out"><button type="submit" class="rail-signout">Sign out</button></form></li>` : renderTemplate`<li><a href="/sign-in">Sign in</a></li>`} </ul> </nav> </details> <nav class="rail" aria-label="Sections"> <ul class="rail-list"> ${publicNav.map((n) => renderTemplate`<li> <a${addAttribute(n.href, "href")}${addAttribute(current === n.key ? "page" : void 0, "aria-current")}${addAttribute(current === n.key ? "is-current" : "", "class")}> <span class="rail-marker" aria-hidden="true"></span>${n.label} </a> </li>`)} </ul> ${customer && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": async ($$result2) => renderTemplate` <p class="rail-heading" id="rail-account">Account</p> <ul class="rail-list" aria-labelledby="rail-account"> ${accountNav.map((n) => renderTemplate`<li> <a${addAttribute(n.href, "href")}${addAttribute(current === n.key ? "page" : void 0, "aria-current")}${addAttribute(current === n.key ? "is-current" : "", "class")}> <span class="rail-marker" aria-hidden="true"></span>${n.label} </a> </li>`)} </ul> ` })}`} <div class="rail-foot"> ${customer ? renderTemplate`<form method="POST" action="/sign-out"><button type="submit" class="rail-signout">Sign out</button></form>` : renderTemplate`<a href="/sign-in" class="rail-signin">Sign in</a>`} </div> </nav> <main id="main" class="content" tabindex="-1"> ${renderSlot($$result, $$slots["default"])} </main> </div> </body></html>`;
}, "/app/src/layouts/Shell.astro", void 0);

export { $$Shell as $ };
