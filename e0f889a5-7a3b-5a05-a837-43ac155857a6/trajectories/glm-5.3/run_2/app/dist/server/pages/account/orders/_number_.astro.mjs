import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, F as Fragment, a as addAttribute } from "../../../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../../../chunks/Shell_COYl1VNS.mjs";
import { r as requirePageCustomer, s as signInRedirect } from "../../../chunks/pageguard_DqzDYTwd.mjs";
import { q } from "../../../chunks/pool_DifDkjYx.mjs";
import { o as orderView } from "../../../chunks/orders_CMRlzCpx.mjs";
import { o as orderChip, l as longDate, m as money } from "../../../chunks/format_F6jgEW4F.mjs";
import { g as getCartForContext } from "../../../chunks/context_Bm1YOHfv.mjs";
/* empty css                                          */
import { renderers } from "../../../renderers.mjs";
const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const customer = await requirePageCustomer(Astro2);
  if (!customer) return Astro2.redirect(signInRedirect(`/account/orders/${Astro2.params.number}`));
  const cart = await getCartForContext(Astro2);
  const cartCount = cart ? cart.view.lines.reduce((s, l) => s + l.quantity, 0) : 0;
  const res = await q("SELECT * FROM order_row WHERE number = $1", [Astro2.params.number]);
  const row = res.rows[0];
  if (!row || !row.customer_id || String(row.customer_id) !== String(customer.id)) return Astro2.redirect("/404");
  const order = await orderView(row);
  const address = order.shipping_address || {};
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `Order ${order.number} — Vela`, "active": "orders", "customer": { email: customer.email, name: customer.name }, "cartCount": cartCount, "data-astro-cid-th46ys4i": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs" data-astro-cid-th46ys4i><a href="/account/orders" data-astro-cid-th46ys4i>Orders</a> <span aria-hidden="true" data-astro-cid-th46ys4i>/</span> <span class="mono" data-astro-cid-th46ys4i>${order.number}</span></nav> <div class="order-page" data-astro-cid-th46ys4i> <section class="card main" data-astro-cid-th46ys4i> <div class="head-row" data-astro-cid-th46ys4i> <h1 class="mono" data-astro-cid-th46ys4i>${order.number}</h1> <span class="chip" data-astro-cid-th46ys4i>${orderChip(order)}</span> </div> <p class="muted" data-astro-cid-th46ys4i>Placed ${longDate(order.placed_at)} · ${money(order.total_minor)}</p> <h2 data-astro-cid-th46ys4i>Lines</h2> <ul class="lines" data-astro-cid-th46ys4i> ${order.lines.map((l) => renderTemplate`<li data-astro-cid-th46ys4i> <span data-astro-cid-th46ys4i>${l.title_snapshot} <span class="mono sku" data-astro-cid-th46ys4i>${l.sku_snapshot}</span></span> <span class="num" data-astro-cid-th46ys4i>${l.quantity} × ${money(l.unit_price_minor)}</span> <span class="num total" data-astro-cid-th46ys4i>${money(l.total_minor)}</span> </li>`)} </ul> <dl class="totals" data-astro-cid-th46ys4i> <div data-astro-cid-th46ys4i><dt data-astro-cid-th46ys4i>Subtotal</dt><dd class="num" data-astro-cid-th46ys4i>${money(order.subtotal_minor)}</dd></div> <div data-astro-cid-th46ys4i><dt data-astro-cid-th46ys4i>Delivery</dt><dd class="num" data-astro-cid-th46ys4i>${money(order.shipping_minor)}</dd></div> ${order.protection_minor > 0 ? renderTemplate`<div data-astro-cid-th46ys4i><dt data-astro-cid-th46ys4i>Shipment protection</dt><dd class="num" data-astro-cid-th46ys4i>${money(order.protection_minor)}</dd></div>` : null} <div data-astro-cid-th46ys4i><dt data-astro-cid-th46ys4i>Tax</dt><dd class="num" data-astro-cid-th46ys4i>${money(order.tax_minor)}</dd></div> <div class="total-row" data-astro-cid-th46ys4i><dt data-astro-cid-th46ys4i>Total</dt><dd class="num" data-astro-cid-th46ys4i>${money(order.total_minor)}</dd></div> </dl> </section> <aside class="card side" data-astro-cid-th46ys4i> <h2 data-astro-cid-th46ys4i>Where it went</h2> <address class="address" data-astro-cid-th46ys4i> ${address.name}<br data-astro-cid-th46ys4i> ${address.line1}${address.line2 ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-th46ys4i": true }, { "default": async ($$result3) => renderTemplate`<br data-astro-cid-th46ys4i>${address.line2}` })}` : null}<br data-astro-cid-th46ys4i> ${[address.city, address.region].filter(Boolean).join(", ")} ${address.postal_code}<br data-astro-cid-th46ys4i> ${address.country} </address> <h2 data-astro-cid-th46ys4i>How it got there</h2> <p class="muted" data-astro-cid-th46ys4i>${order.shipping_method} · ${order.shipping_method === "Express" ? "2 days" : "5 to 7 days"}</p> <h2 data-astro-cid-th46ys4i>Serials</h2> ${order.serials.length === 0 ? renderTemplate`<p class="muted" data-astro-cid-th46ys4i>No cameras on this order.</p>` : renderTemplate`<ul class="serials" data-astro-cid-th46ys4i> ${order.serials.map((s) => renderTemplate`<li data-astro-cid-th46ys4i> <span class="mono" data-astro-cid-th46ys4i>${s.serial}</span> ${s.registered ? renderTemplate`<span class="chip chip-ok" data-astro-cid-th46ys4i>Registered</span>` : renderTemplate`<button class="btn" type="button"${addAttribute(s.serial, "data-register-serial")} data-astro-cid-th46ys4i>Register to this account</button>`} </li>`)} </ul>`} <p class="inline-error" data-serial-error hidden data-astro-cid-th46ys4i></p> </aside> </div> ` })}  `;
}, "/app/src/pages/account/orders/[number].astro", void 0);
const $$file = "/app/src/pages/account/orders/[number].astro";
const $$url = "/account/orders/[number]";
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
