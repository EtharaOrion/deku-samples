import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute, n as renderSlot } from './astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Base } from './Base_CnCPTmfg.mjs';
import { useState, useEffect } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';
/* empty css                             */

function RailToggle() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const rail = document.getElementById("rail");
    if (!rail) return;
    rail.classList.toggle("is-open", open);
  }, [open]);
  return jsxs("button", {
    type: "button",
    class: "rail-toggle",
    "aria-expanded": open ? "true" : "false",
    "aria-controls": "rail",
    onClick: () => setOpen((v) => !v),
    children: [jsx("span", {
      "aria-hidden": "true",
      children: open ? "✕" : "≡"
    }), jsx("span", {
      children: open ? "Close sections" : "Sections"
    })]
  });
}

const $$Astro = createAstro();
const $$Shell = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Shell;
  const { title, description, current = "", customer = null, cartCount = 0 } = Astro2.props;
  const shopLinks = [
    { href: "/shop", label: "Shop", key: "shop" },
    { href: "/downloads", label: "Downloads", key: "downloads" },
    { href: "/doctor", label: "Firmware installer", key: "doctor" }
  ];
  const accountLinks = [
    { href: "/account", label: "Overview", key: "account" },
    { href: "/account/orders", label: "Orders", key: "orders" },
    { href: "/account/cameras", label: "Cameras", key: "cameras" }
  ];
  const badge = cartCount > 99 ? "99+" : String(cartCount);
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": title, "description": description, "data-astro-cid-7itcaece": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="shell" data-astro-cid-7itcaece> <header class="topbar" data-astro-cid-7itcaece> <a class="wordmark" href="/" data-astro-cid-7itcaece>Vela</a> <div class="topbar__spacer" data-astro-cid-7itcaece></div> ${customer ? renderTemplate`<form method="POST" action="/sign-out" class="row" data-astro-cid-7itcaece> <span class="small muted" data-astro-cid-7itcaece>${customer.email}</span> <button class="btn btn--secondary btn--small" type="submit" data-astro-cid-7itcaece>Sign out</button> </form>` : renderTemplate`<a class="btn btn--secondary btn--small" href="/sign-in" data-astro-cid-7itcaece>Sign in</a>`} <!-- The cart control's accessible name states the item count. --> <a class="cart-control" href="/cart"${addAttribute(`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`, "aria-label")} data-astro-cid-7itcaece> <span aria-hidden="true" data-astro-cid-7itcaece>Cart</span> ${cartCount > 0 && renderTemplate`<span class="cart-badge num" aria-hidden="true" data-astro-cid-7itcaece>${badge}</span>`} </a> </header> <div class="layout" data-astro-cid-7itcaece> ${renderComponent($$result2, "RailToggle", RailToggle, { "client:idle": true, "client:component-hydration": "idle", "client:component-path": "/app/src/islands/RailToggle.jsx", "client:component-export": "default", "data-astro-cid-7itcaece": true })} <nav class="rail" id="rail" aria-label="Sections" data-astro-cid-7itcaece> <div class="rail__group" data-astro-cid-7itcaece> <div class="rail__label" id="rail-shop" data-astro-cid-7itcaece>Store</div> <ul class="rail__list" role="list" aria-labelledby="rail-shop" data-astro-cid-7itcaece> ${shopLinks.map((l) => renderTemplate`<li data-astro-cid-7itcaece> <a class="rail__link"${addAttribute(l.href, "href")}${addAttribute(current === l.key ? "page" : void 0, "aria-current")} data-astro-cid-7itcaece> <span class="rail__marker" aria-hidden="true" data-astro-cid-7itcaece></span> <span data-astro-cid-7itcaece>${l.label}</span> </a> </li>`)} </ul> </div> ${customer && renderTemplate`<div class="rail__group" data-astro-cid-7itcaece> <div class="rail__label" id="rail-account" data-astro-cid-7itcaece>Account</div> <ul class="rail__list" role="list" aria-labelledby="rail-account" data-astro-cid-7itcaece> ${accountLinks.map((l) => renderTemplate`<li data-astro-cid-7itcaece> <a class="rail__link"${addAttribute(l.href, "href")}${addAttribute(current === l.key ? "page" : void 0, "aria-current")} data-astro-cid-7itcaece> <span class="rail__marker" aria-hidden="true" data-astro-cid-7itcaece></span> <span data-astro-cid-7itcaece>${l.label}</span> </a> </li>`)} </ul> </div>`} </nav> <main class="content" id="main" data-astro-cid-7itcaece> ${renderSlot($$result2, $$slots["default"])} </main> </div> </div> ` })} `;
}, "/app/src/components/Shell.astro", void 0);

export { $$Shell as $ };
