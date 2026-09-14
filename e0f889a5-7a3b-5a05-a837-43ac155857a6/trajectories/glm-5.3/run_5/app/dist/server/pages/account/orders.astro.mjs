import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from "../../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { s as sessionCustomer, $ as $$PageShell } from "../../chunks/PageShell_DYrBPb7v.mjs";
import { q } from "../../chunks/db_C-9WqIXq.mjs";
import { t as toOrderView } from "../../chunks/orders_Bfk_OpWP.mjs";
import { d as dollars } from "../../chunks/cart_BmbV16eC.mjs";
/* empty css                                    */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await sessionCustomer(Astro2.request, Astro2.cookies);
  if (!customer) return Astro2.redirect("/sign-in?redirect=/account/orders");
  const orders = await q(
    `SELECT o.*, (SELECT l.title_snapshot FROM order_line l WHERE l.order_id = o.id ORDER BY l.id ASC LIMIT 1) AS first_line,
          (SELECT count(*)::int FROM order_line l WHERE l.order_id = o.id) AS line_count
     FROM "order" o WHERE o.customer_id = $1 ORDER BY o.placed_at DESC, o.id DESC`,
    [customer.id]
  );
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": "Your orders — Vela", "heading": "Orders", "active": "orders", "customer": { name: customer.name, email: customer.email }, "data-astro-cid-fdv6b7ge": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="orders-page" data-astro-cid-fdv6b7ge> ${orders.length === 0 ? renderTemplate`<p class="empty-note" data-astro-cid-fdv6b7ge>No orders yet.</p>` : renderTemplate`<ul class="orders" data-astro-cid-fdv6b7ge> ${orders.map((o) => renderTemplate`<li class="order card" data-astro-cid-fdv6b7ge> <a${addAttribute(`/account/orders/${o.number}`, "href")} data-astro-cid-fdv6b7ge> <span class="serial order-number" data-astro-cid-fdv6b7ge>${o.number}</span> <span class="date tnum" data-astro-cid-fdv6b7ge>${new Date(o.placed_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span> <span class="first" data-astro-cid-fdv6b7ge>${o.first_line}${o.line_count > 1 ? ` and ${o.line_count - 1} more` : ""}</span> <span class="total tnum" data-astro-cid-fdv6b7ge>${dollars(Number(o.total_minor))}</span> <span class="chip chip--done" data-astro-cid-fdv6b7ge>${toOrderView(o, []).status_chip}</span> </a> </li>`)} </ul>`} </div> ` })} `;
}, "/app/src/pages/account/orders/index.astro", void 0);
const $$file = "/app/src/pages/account/orders/index.astro";
const $$url = "/account/orders";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
