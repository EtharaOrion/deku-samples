import { c as createComponent, m as maybeRenderHead, a as addAttribute, r as renderTemplate, b as createAstro, d as renderComponent, F as Fragment, e as renderSlot } from './astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { $ as $$Base } from './Base_BYKfREn2.mjs';
import 'clsx';
/* empty css                            */
import { a as apiGet, b as authHeaders } from './api_eUbQd3xF.mjs';

const $$Astro$1 = createAstro();
const $$CartControl = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$CartControl;
  const { count = 0 } = Astro2.props;
  const badge = count > 99 ? "99+" : String(count);
  const name = count === 1 ? "Cart, 1 item" : `Cart, ${count} items`;
  return renderTemplate`${maybeRenderHead()}<a class="cart-control" href="/cart" data-cart-control${addAttribute(name, "aria-label")} data-astro-cid-jv4xumlg> <span aria-hidden="true" data-astro-cid-jv4xumlg>Cart</span>  ${count > 0 && renderTemplate`<span class="badge tnum" data-cart-badge aria-hidden="true" data-astro-cid-jv4xumlg>${badge}</span>`} </a>  `;
}, "/app/src/islands/CartControl.astro", void 0);

const $$Astro = createAstro();
const $$Shell = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Shell;
  const { title, description, current = "", customer = null, cartCount = 0 } = Astro2.props;
  const primary = [
    { href: "/shop", label: "Shop", key: "shop" },
    { href: "/downloads", label: "Downloads", key: "downloads" },
    { href: "/doctor", label: "Firmware installer", key: "doctor" }
  ];
  const account = [
    { href: "/account", label: "Overview", key: "account" },
    { href: "/account/orders", label: "Orders", key: "orders" },
    { href: "/account/cameras", label: "Cameras", key: "cameras" }
  ];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": title, "description": description, "data-astro-cid-eh5ed76d": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="shell" data-astro-cid-eh5ed76d> <!-- A compact bar beside the rail: the wordmark and the cart control. --> <header class="bar" data-astro-cid-eh5ed76d> <a class="wordmark" href="/" data-astro-cid-eh5ed76d>Vela</a> <div class="bar-end" data-astro-cid-eh5ed76d> ${renderComponent($$result2, "CartControl", $$CartControl, { "count": cartCount, "data-astro-cid-eh5ed76d": true })} ${customer ? renderTemplate`<form method="POST" action="/sign-out" class="bar-account" data-astro-cid-eh5ed76d> <span class="bar-email" data-astro-cid-eh5ed76d>${customer.email}</span> <button class="btn btn-quiet btn-small" type="submit" data-astro-cid-eh5ed76d>Sign out</button> </form>` : renderTemplate`<a class="btn btn-quiet btn-small" href="/sign-in" data-astro-cid-eh5ed76d>Sign in</a>`} </div> </header> <!-- On a narrow viewport the rail collapses to one control above the content. --> <details class="rail-toggle" data-astro-cid-eh5ed76d> <summary class="btn btn-secondary btn-small" data-astro-cid-eh5ed76d>Menu</summary> <nav class="rail-collapsed" aria-label="Sections" data-astro-cid-eh5ed76d> ${primary.map((item) => renderTemplate`<a${addAttribute(item.href, "href")}${addAttribute(current === item.key ? "page" : void 0, "aria-current")} data-astro-cid-eh5ed76d>${item.label}</a>`)} ${customer && account.map((item) => renderTemplate`<a${addAttribute(item.href, "href")}${addAttribute(current === item.key ? "page" : void 0, "aria-current")} data-astro-cid-eh5ed76d>${item.label}</a>`)} </nav> </details> <nav class="rail" aria-label="Sections" data-astro-cid-eh5ed76d> <ul data-astro-cid-eh5ed76d> ${primary.map((item) => renderTemplate`<li data-astro-cid-eh5ed76d> <a${addAttribute(item.href, "href")}${addAttribute(current === item.key ? "page" : void 0, "aria-current")} data-astro-cid-eh5ed76d> <span class="marker" aria-hidden="true" data-astro-cid-eh5ed76d></span>${item.label} </a> </li>`)} </ul> ${customer && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-eh5ed76d": true }, { "default": ($$result3) => renderTemplate` <p class="rail-heading" id="rail-account" data-astro-cid-eh5ed76d>Account</p> <ul aria-labelledby="rail-account" data-astro-cid-eh5ed76d> ${account.map((item) => renderTemplate`<li data-astro-cid-eh5ed76d> <a${addAttribute(item.href, "href")}${addAttribute(current === item.key ? "page" : void 0, "aria-current")} data-astro-cid-eh5ed76d> <span class="marker" aria-hidden="true" data-astro-cid-eh5ed76d></span>${item.label} </a> </li>`)} </ul> ` })}`} </nav> <main id="main" class="content" data-astro-cid-eh5ed76d> ${renderSlot($$result2, $$slots["default"])} </main> </div> ` })} `;
}, "/app/src/layouts/Shell.astro", void 0);

async function viewerFor(request) {
  const [me, cart] = await Promise.all([
    apiGet(request, "/auth/me", { headers: authHeaders(request) }),
    apiGet(request, "/cart")
  ]);
  return {
    customer: me.ok ? me.data.customer : null,
    cartCount: cart.ok ? Number(cart.data.item_count || 0) : 0
  };
}
function signInRedirect(pathname) {
  const next = encodeURIComponent(pathname);
  return new Response(null, { status: 302, headers: { location: `/sign-in?next=${next}` } });
}

export { $$Shell as $, signInRedirect as s, viewerFor as v };
