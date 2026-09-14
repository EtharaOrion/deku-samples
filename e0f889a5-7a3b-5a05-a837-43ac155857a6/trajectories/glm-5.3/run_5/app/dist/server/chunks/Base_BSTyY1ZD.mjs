import { e as createComponent, g as addAttribute, p as renderHead, o as renderSlot, r as renderTemplate, h as createAstro } from "./astro/server_-SqM4FRO.mjs";
import "piccolore";
import "clsx";
/* empty css                            */
const $$Astro = createAstro();
const $$Base = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Base;
  const { title = "Vela", heading, active = "", customer = null, cartCount = 0, bare = false } = Astro2.props;
  const rail = [
    { href: "/shop", label: "Shop", key: "shop" },
    { href: "/downloads", label: "Downloads", key: "downloads" },
    { href: "/doctor", label: "Firmware installer", key: "doctor" }
  ];
  if (customer) {
    rail.push({ href: "/account", label: "Overview", key: "account" });
    rail.push({ href: "/account/orders", label: "Orders", key: "orders" });
    rail.push({ href: "/account/cameras", label: "Cameras", key: "cameras" });
  }
  const badge = cartCount > 99 ? "99+" : String(cartCount);
  return renderTemplate`<html lang="en" data-astro-cid-5hce7sga> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="generator"${addAttribute(Astro2.generator, "content")}><link rel="icon" href="/favicon.png" sizes="any">${renderHead()}</head> <body${addAttribute([bare ? "surface-dark" : "surface-light", "layout-shell"], "class:list")} data-astro-cid-5hce7sga> <a class="skip-link" href="#main" data-astro-cid-5hce7sga>Skip to content</a> ${bare ? renderTemplate`${renderSlot($$result, $$slots["default"])}` : renderTemplate`<div class="frame" data-astro-cid-5hce7sga> <nav class="rail" aria-label="Main" data-astro-cid-5hce7sga> <a class="rail__wordmark" href="/" data-astro-cid-5hce7sga>Vela</a> <ul class="rail__list" data-astro-cid-5hce7sga> ${rail.map((item) => renderTemplate`<li data-astro-cid-5hce7sga> <a${addAttribute(item.href, "href")}${addAttribute(active === item.key ? "page" : void 0, "aria-current")}${addAttribute(["rail__link", { "is-current": active === item.key }], "class:list")} data-astro-cid-5hce7sga> <span class="rail__marker" aria-hidden="true" data-astro-cid-5hce7sga></span> <span data-astro-cid-5hce7sga>${item.label}</span> </a> </li>`)} </ul> <div class="rail__foot" data-astro-cid-5hce7sga> ${customer ? renderTemplate`<form method="post" action="/sign-out" data-astro-cid-5hce7sga> <span class="rail__who" data-astro-cid-5hce7sga>${customer.name}</span> <button class="btn btn--quiet rail__signout" type="submit" data-astro-cid-5hce7sga>Sign out</button> </form>` : renderTemplate`<a class="rail__link" href="/sign-in" data-astro-cid-5hce7sga><span class="rail__marker" aria-hidden="true" data-astro-cid-5hce7sga></span><span data-astro-cid-5hce7sga>Sign in</span></a>`} </div> </nav> <div class="column" data-astro-cid-5hce7sga> <header class="bar" data-astro-cid-5hce7sga> <details class="rail-toggle" data-astro-cid-5hce7sga> <summary aria-label="Open navigation" data-astro-cid-5hce7sga>Menu</summary> <ul class="rail-toggle__list" data-astro-cid-5hce7sga> ${rail.map((item) => renderTemplate`<li data-astro-cid-5hce7sga><a${addAttribute(item.href, "href")}${addAttribute(active === item.key ? "page" : void 0, "aria-current")} data-astro-cid-5hce7sga>${item.label}</a></li>`)} <li data-astro-cid-5hce7sga><a${addAttribute(customer ? "/account" : "/sign-in", "href")} data-astro-cid-5hce7sga>${customer ? "Overview" : "Sign in"}</a></li> </ul> </details> <a class="bar__wordmark" href="/" data-astro-cid-5hce7sga>Vela</a> <a class="bar__cart" href="/cart" data-cart-control data-astro-cid-5hce7sga> <span class="bar__cart-label" data-astro-cid-5hce7sga>Cart</span> ${cartCount > 0 && renderTemplate`<span class="bar__badge" data-cart-badge data-astro-cid-5hce7sga>${badge}</span>`} <span class="visually-hidden" data-astro-cid-5hce7sga>${cartCount === 0 ? "Cart, empty" : `Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}</span> </a> </header> <main id="main" tabindex="-1" data-astro-cid-5hce7sga> ${heading && renderTemplate`<h1 class="page-title" data-astro-cid-5hce7sga>${heading}</h1>`} ${renderSlot($$result, $$slots["default"])} </main> </div> </div>`} </body></html>`;
}, "/app/src/layouts/Base.astro", void 0);
export {
  $$Base as $
};
