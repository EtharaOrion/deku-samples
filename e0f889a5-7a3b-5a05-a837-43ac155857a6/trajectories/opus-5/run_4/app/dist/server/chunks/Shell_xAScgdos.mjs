import { e as createComponent, m as maybeRenderHead, g as addAttribute, r as renderTemplate, k as renderComponent, h as createAstro, n as Fragment, o as renderSlot, l as renderScript } from './astro/server_Dku1auYb.mjs';
import 'piccolore';
import { a as $$Base, $ as $$Wordmark } from './Wordmark_Wku2sS-M.mjs';
/* empty css                            */
import { c as currentCustomer, d as currentCart } from './server_SMyiD-DF.mjs';

const $$Astro$1 = createAstro();
const $$Rail = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$Rail;
  const { path, customer } = Astro2.props;
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
  function isCurrent(entry) {
    if (entry.exact) return path === entry.href;
    return path === entry.href || path.startsWith(`${entry.href}/`);
  }
  return renderTemplate`${maybeRenderHead()}<nav class="rail" aria-label="Sections" data-astro-cid-csby2m2u> <ul class="rail-group" data-astro-cid-csby2m2u> ${primary.map((entry) => renderTemplate`<li data-astro-cid-csby2m2u> <a${addAttribute(entry.href, "href")}${addAttribute(["rail-link", { current: isCurrent(entry) }], "class:list")}${addAttribute(isCurrent(entry) ? "page" : void 0, "aria-current")} data-astro-cid-csby2m2u> <span class="marker" aria-hidden="true" data-astro-cid-csby2m2u></span> <span data-astro-cid-csby2m2u>${entry.label}</span> </a> </li>`)} </ul> ${customer && renderTemplate`${renderComponent($$result, "Fragment", Fragment, { "data-astro-cid-csby2m2u": true }, { "default": ($$result2) => renderTemplate` <p class="rail-heading" id="rail-account" data-astro-cid-csby2m2u>Account</p> <ul class="rail-group" aria-labelledby="rail-account" data-astro-cid-csby2m2u> ${account.map((entry) => renderTemplate`<li data-astro-cid-csby2m2u> <a${addAttribute(entry.href, "href")}${addAttribute(["rail-link", { current: isCurrent(entry) }], "class:list")}${addAttribute(isCurrent(entry) ? "page" : void 0, "aria-current")} data-astro-cid-csby2m2u> <span class="marker" aria-hidden="true" data-astro-cid-csby2m2u></span> <span data-astro-cid-csby2m2u>${entry.label}</span> </a> </li>`)} </ul> ` })}`} <div class="rail-foot" data-astro-cid-csby2m2u> ${customer ? renderTemplate`<form method="post" action="/sign-out" data-astro-cid-csby2m2u> <button class="rail-link rail-button" type="submit" data-astro-cid-csby2m2u> <span class="marker" aria-hidden="true" data-astro-cid-csby2m2u></span> <span data-astro-cid-csby2m2u>Sign out</span> </button> <span class="rail-who ident" data-astro-cid-csby2m2u>${customer.email}</span> </form>` : renderTemplate`<a href="/sign-in" class="rail-link" data-astro-cid-csby2m2u> <span class="marker" aria-hidden="true" data-astro-cid-csby2m2u></span> <span data-astro-cid-csby2m2u>Sign in</span> </a>`} </div> </nav> `;
}, "/app/src/components/Rail.astro", void 0);

const $$Astro = createAstro();
const $$Shell = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Shell;
  const { title, description } = Astro2.props;
  const path = Astro2.url.pathname;
  const customer = await currentCustomer(Astro2);
  let cart = null;
  try {
    cart = await currentCart(Astro2);
  } catch {
    cart = null;
  }
  const count = cart ? cart.item_count : 0;
  const badge = count > 99 ? "99+" : String(count);
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": title, "description": description, "ground": "light", "data-astro-cid-eh5ed76d": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<a class="skip-link" href="#main" data-astro-cid-eh5ed76d>Skip to content</a> <div class="shell" data-astro-cid-eh5ed76d> <!-- The compact bar beside the rail: wordmark home, and a cart control
         whose accessible name states the item count. --> <header class="bar" data-astro-cid-eh5ed76d> <a href="/" class="bar-mark" aria-label="Vela, back to the front page" data-astro-cid-eh5ed76d> ${renderComponent($$result2, "Wordmark", $$Wordmark, { "data-astro-cid-eh5ed76d": true })} </a> <div class="bar-end" data-astro-cid-eh5ed76d> <button class="rail-toggle" type="button" aria-expanded="false" aria-controls="rail-panel" data-rail-toggle data-astro-cid-eh5ed76d>Sections</button> <a href="/cart" class="cart-control"${addAttribute(`Cart, ${count} ${count === 1 ? "item" : "items"}`, "aria-label")} data-astro-cid-eh5ed76d> <span aria-hidden="true" data-astro-cid-eh5ed76d>Cart</span> ${count > 0 && renderTemplate`<span class="cart-badge tnum" aria-hidden="true" data-astro-cid-eh5ed76d>${badge}</span>`} </a> </div> </header> <div class="shell-body" data-astro-cid-eh5ed76d> <div class="rail-panel" id="rail-panel" data-rail-panel data-astro-cid-eh5ed76d> ${renderComponent($$result2, "Rail", $$Rail, { "path": path, "customer": customer, "data-astro-cid-eh5ed76d": true })} </div> <main id="main" class="content" tabindex="-1" data-astro-cid-eh5ed76d> ${renderSlot($$result2, $$slots["default"])} </main> </div> </div> ${renderScript($$result2, "/app/src/layouts/Shell.astro?astro&type=script&index=0&lang.ts")}  ` })}`;
}, "/app/src/layouts/Shell.astro", void 0);

export { $$Shell as $ };
