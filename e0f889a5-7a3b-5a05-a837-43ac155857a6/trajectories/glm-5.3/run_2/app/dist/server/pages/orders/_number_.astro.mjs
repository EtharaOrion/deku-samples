import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute, F as Fragment } from "../../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../../chunks/Shell_COYl1VNS.mjs";
import { a as orderViewByNumber } from "../../chunks/orders_CMRlzCpx.mjs";
import { s as sha256Hex } from "../../chunks/crypto_BsBBFoSY.mjs";
import { o as orderChip, m as money, l as longDate } from "../../chunks/format_F6jgEW4F.mjs";
import { a as getCustomer, g as getCartForContext } from "../../chunks/context_Bm1YOHfv.mjs";
/* empty css                                       */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const { number } = Astro2.params;
  const accessToken = Astro2.url.searchParams.get("access_token");
  const order = await orderViewByNumber(number || "");
  if (!order) return Astro2.redirect("/404");
  const tokenOk = accessToken && sha256Hex(accessToken) === await orderHash(number);
  const customer = await getCustomer(Astro2);
  const owns = Boolean(customer && order.customer_id && String(order.customer_id) === String(customer.id));
  if (!tokenOk && !owns) return Astro2.redirect("/404");
  const cart = await getCartForContext(Astro2);
  const cartCount = cart ? cart.view.lines.reduce((s, l) => s + l.quantity, 0) : 0;
  async function orderHash(num) {
    const { q } = await import("../../chunks/pool_DifDkjYx.mjs");
    const res = await q("SELECT access_token_hash FROM order_row WHERE number = $1", [num]);
    return res.rows[0]?.access_token_hash ?? "";
  }
  const chip = orderChip(order);
  const address = order.shipping_address || {};
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `Order ${order.number} — Vela`, "active": "", "cartCount": cartCount, "data-astro-cid-cxx6wafo": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="confirm card" data-astro-cid-cxx6wafo> <p class="confirm-state" data-astro-cid-cxx6wafo>Confirmed</p> <h1 data-astro-cid-cxx6wafo>Order ${order.number} is confirmed.</h1> <p class="confirm-body" data-astro-cid-cxx6wafo>We have emailed ${order.email}.</p> <div class="confirm-actions" data-astro-cid-cxx6wafo> ${customer ? renderTemplate`<a class="btn btn-primary"${addAttribute(`/account/orders/${order.number}`, "href")} data-astro-cid-cxx6wafo>Keep track of this order</a>` : renderTemplate`<a class="btn btn-primary"${addAttribute(`/orders/${order.number}?access_token=${accessToken ?? ""}`, "href")} data-astro-cid-cxx6wafo>Keep track of this order</a>`} </div> </div> <div class="order-layout" data-astro-cid-cxx6wafo> <section aria-label="Lines" class="card lines-card" data-astro-cid-cxx6wafo> <h2 data-astro-cid-cxx6wafo>What you bought</h2> <ul class="order-lines" data-astro-cid-cxx6wafo> ${order.lines.map((l) => renderTemplate`<li data-astro-cid-cxx6wafo> <span class="line-title" data-astro-cid-cxx6wafo>${l.title_snapshot} <span class="mono line-sku" data-astro-cid-cxx6wafo>${l.sku_snapshot}</span></span> <span class="num" data-astro-cid-cxx6wafo>${l.quantity} × ${money(l.unit_price_minor)}</span> <span class="num line-total" data-astro-cid-cxx6wafo>${money(l.total_minor)}</span> </li>`)} </ul> <dl class="totals" data-astro-cid-cxx6wafo> <div data-astro-cid-cxx6wafo><dt data-astro-cid-cxx6wafo>Subtotal</dt><dd class="num" data-astro-cid-cxx6wafo>${money(order.subtotal_minor)}</dd></div> <div data-astro-cid-cxx6wafo><dt data-astro-cid-cxx6wafo>Delivery</dt><dd class="num" data-astro-cid-cxx6wafo>${money(order.shipping_minor)}</dd></div> ${order.protection_minor > 0 ? renderTemplate`<div data-astro-cid-cxx6wafo><dt data-astro-cid-cxx6wafo>Shipment protection</dt><dd class="num" data-astro-cid-cxx6wafo>${money(order.protection_minor)}</dd></div>` : null} <div data-astro-cid-cxx6wafo><dt data-astro-cid-cxx6wafo>Tax</dt><dd class="num" data-astro-cid-cxx6wafo>${money(order.tax_minor)}</dd></div> <div class="total-row" data-astro-cid-cxx6wafo><dt data-astro-cid-cxx6wafo>Total</dt><dd class="num" data-astro-cid-cxx6wafo>${money(order.total_minor)}</dd></div> </dl> <p class="chip-row" data-astro-cid-cxx6wafo><span class="chip chip-ok" data-astro-cid-cxx6wafo>${chip}</span></p> <p class="placed" data-astro-cid-cxx6wafo>Placed ${longDate(order.placed_at)}</p> </section> <aside class="card side-card" data-astro-cid-cxx6wafo> <h2 data-astro-cid-cxx6wafo>Where it goes</h2> <address class="address" data-astro-cid-cxx6wafo> ${address.name}<br data-astro-cid-cxx6wafo> ${address.line1}${address.line2 ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-cxx6wafo": true }, { "default": async ($$result3) => renderTemplate`<br data-astro-cid-cxx6wafo>${address.line2}` })}` : null}<br data-astro-cid-cxx6wafo> ${[address.city, address.region].filter(Boolean).join(", ")} ${address.postal_code}<br data-astro-cid-cxx6wafo> ${address.country} </address> <h2 data-astro-cid-cxx6wafo>How it gets there</h2> <p data-astro-cid-cxx6wafo>${order.shipping_method} · ${order.shipping_method === "Express" ? "2 days" : "5 to 7 days"}</p> ${order.serials.length > 0 ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-cxx6wafo": true }, { "default": async ($$result3) => renderTemplate` <h2 data-astro-cid-cxx6wafo>Serial numbers</h2> <ul class="serials" data-astro-cid-cxx6wafo> ${order.serials.map((s) => renderTemplate`<li data-astro-cid-cxx6wafo><span class="mono" data-astro-cid-cxx6wafo>${s.serial}</span></li>`)} </ul> ` })}` : null} </aside> </div> ` })} `;
}, "/app/src/pages/orders/[number].astro", void 0);
const $$file = "/app/src/pages/orders/[number].astro";
const $$url = "/orders/[number]";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$number,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
