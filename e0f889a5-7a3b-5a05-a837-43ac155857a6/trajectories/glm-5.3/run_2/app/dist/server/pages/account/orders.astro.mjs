import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from "../../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../../chunks/Shell_COYl1VNS.mjs";
import { r as requirePageCustomer, s as signInRedirect } from "../../chunks/pageguard_DqzDYTwd.mjs";
import { q } from "../../chunks/pool_DifDkjYx.mjs";
import { o as orderView } from "../../chunks/orders_CMRlzCpx.mjs";
import { s as shortDate, m as money, o as orderChip } from "../../chunks/format_F6jgEW4F.mjs";
import { g as getCartForContext } from "../../chunks/context_Bm1YOHfv.mjs";
/* empty css                                     */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$Orders = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Orders;
  const customer = await requirePageCustomer(Astro2);
  if (!customer) return Astro2.redirect(signInRedirect("/account/orders"));
  const cart = await getCartForContext(Astro2);
  const cartCount = cart ? cart.view.lines.reduce((s, l) => s + l.quantity, 0) : 0;
  const res = await q("SELECT * FROM order_row WHERE customer_id = $1 ORDER BY placed_at DESC NULLS LAST, id DESC LIMIT 100", [customer.id]);
  const orders = await Promise.all(res.rows.map((o) => orderView(o)));
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Orders — Vela", "active": "orders", "customer": { email: customer.email, name: customer.name }, "cartCount": cartCount, "data-astro-cid-p565c7ir": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-p565c7ir> <h1 data-astro-cid-p565c7ir>Orders</h1> </div> ${orders.length === 0 ? renderTemplate`<div class="empty" data-astro-cid-p565c7ir><p data-astro-cid-p565c7ir>No orders yet.</p><a class="btn" href="/shop" data-astro-cid-p565c7ir>See the shop</a></div>` : renderTemplate`<ul class="order-list" data-astro-cid-p565c7ir> ${orders.map((o) => renderTemplate`<li class="card order" data-astro-cid-p565c7ir> <a class="order-link"${addAttribute(`/account/orders/${o.number}`, "href")} data-astro-cid-p565c7ir> <span class="mono order-number" data-astro-cid-p565c7ir>${o.number}</span> <span class="order-date" data-astro-cid-p565c7ir>${shortDate(o.placed_at)}</span> <span class="order-first" data-astro-cid-p565c7ir>${o.lines[0]?.title_snapshot ?? "Order"}${o.lines.length > 1 ? ` and ${o.lines.length - 1} more` : ""}</span> <span class="num order-total" data-astro-cid-p565c7ir>${money(o.total_minor)}</span> <span class="chip" data-astro-cid-p565c7ir>${orderChip(o)}</span> </a> </li>`)} </ul>`}` })} `;
}, "/app/src/pages/account/orders.astro", void 0);
const $$file = "/app/src/pages/account/orders.astro";
const $$url = "/account/orders";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Orders,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
