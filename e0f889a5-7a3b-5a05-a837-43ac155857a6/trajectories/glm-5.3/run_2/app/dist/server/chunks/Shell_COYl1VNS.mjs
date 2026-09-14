import { c as createComponent, a as addAttribute, e as renderHead, r as renderTemplate, f as renderSlot, b as createAstro } from "./astro/server_BSRltX1G.mjs";
import "kleur/colors";
import "clsx";
/* empty css                           */
/* empty css                           */
const $$Astro = createAstro();
const $$Shell = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Shell;
  const { title = "Vela", active = "", customer = null, cartCount = 0 } = Astro2.props;
  const nav = [
    { href: "/shop", label: "Shop", key: "shop" },
    { href: "/downloads", label: "Downloads", key: "downloads" },
    { href: "/doctor", label: "Firmware installer", key: "doctor" },
    ...customer ? [
      { href: "/account", label: "Overview", key: "account" },
      { href: "/account/orders", label: "Orders", key: "orders" },
      { href: "/account/cameras", label: "Cameras", key: "cameras" }
    ] : []
  ];
  const badge = cartCount > 99 ? "99+" : String(cartCount);
  return renderTemplate`<html lang="en" data-astro-cid-eh5ed76d> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>${title}</title><meta name="generator"${addAttribute(Astro2.generator, "content")}>${renderHead()}</head> <body class="surface-light" data-astro-cid-eh5ed76d> <a class="skip-link" href="#main" data-astro-cid-eh5ed76d>Skip to content</a> <div class="shell" data-astro-cid-eh5ed76d> <nav class="rail" aria-label="Primary" data-astro-cid-eh5ed76d> <a class="rail-wordmark" href="/" data-astro-cid-eh5ed76d>vela</a> <ul class="rail-list" data-astro-cid-eh5ed76d> ${nav.map((item) => renderTemplate`<li data-astro-cid-eh5ed76d> <a${addAttribute(item.href, "href")}${addAttribute(["rail-link", { "is-active": active === item.key }], "class:list")}${addAttribute(active === item.key ? "page" : void 0, "aria-current")} data-astro-cid-eh5ed76d> <span class="rail-marker" aria-hidden="true" data-astro-cid-eh5ed76d></span> ${item.label} </a> </li>`)} </ul> <div class="rail-foot" data-astro-cid-eh5ed76d> ${customer ? renderTemplate`<form method="post" action="/sign-out" data-astro-cid-eh5ed76d> <button class="btn rail-signout" type="submit" data-astro-cid-eh5ed76d>Sign out</button> </form>` : renderTemplate`<a class="btn rail-signout" href="/sign-in" data-astro-cid-eh5ed76d>Sign in</a>`} </div> </nav> <div class="rail-toggle-wrap" data-astro-cid-eh5ed76d> <button class="btn rail-toggle" type="button" aria-expanded="false" aria-controls="rail-nav" data-astro-cid-eh5ed76d> <span aria-hidden="true" data-astro-cid-eh5ed76d>≡</span> <span class="rail-toggle-label" data-astro-cid-eh5ed76d>${active ? nav.find((n) => n.key === active)?.label ?? "Menu" : "Menu"}</span> </button> <nav id="rail-nav" class="rail-nav-collapsed" hidden data-astro-cid-eh5ed76d> <ul data-astro-cid-eh5ed76d> ${nav.map((item) => renderTemplate`<li data-astro-cid-eh5ed76d><a${addAttribute(item.href, "href")}${addAttribute(active === item.key ? "page" : void 0, "aria-current")} data-astro-cid-eh5ed76d>${item.label}</a></li>`)} </ul> </nav> </div> <div class="content" data-astro-cid-eh5ed76d> <header class="bar" data-astro-cid-eh5ed76d> <a class="bar-wordmark" href="/" data-astro-cid-eh5ed76d>vela</a> <a class="bar-cart" href="/cart"${addAttribute(`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`, "aria-label")} data-astro-cid-eh5ed76d>
Cart
${cartCount > 0 ? renderTemplate`<span class="count-badge num" aria-hidden="true" data-astro-cid-eh5ed76d>${badge}</span>` : null} </a> </header> <main id="main" class="main" data-astro-cid-eh5ed76d> ${renderSlot($$result, $$slots["default"])} </main> </div> </div>  </body> </html> `;
}, "/app/src/layouts/Shell.astro", void 0);
export {
  $$Shell as $
};
