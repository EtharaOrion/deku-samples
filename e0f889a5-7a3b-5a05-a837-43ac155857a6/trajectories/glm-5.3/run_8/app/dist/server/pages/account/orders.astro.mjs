import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from "../../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../../chunks/App_CiTDO3Su.mjs";
import { q } from "../../chunks/index_CC0DBeZe.mjs";
import { currentCustomer } from "../../chunks/session_C_3CDjrl.mjs";
/* empty css                                    */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await currentCustomer(Astro2.request);
  if (!customer) return Astro2.redirect(`/sign-in?redirect=${encodeURIComponent("/account/orders")}`);
  const orders = await q("SELECT * FROM orders WHERE customer_id = $1 ORDER BY id DESC", [customer.id]);
  const linesByOrder = /* @__PURE__ */ new Map();
  for (const o of orders) {
    const lines = await q("SELECT title_snapshot FROM order_line WHERE order_id = $1 ORDER BY id", [o.id]);
    linesByOrder.set(o.id, lines);
  }
  const lineSummary = (o) => {
    const lines = linesByOrder.get(o.id) || [];
    if (!lines.length) return "—";
    const more = lines.length - 1;
    return more > 0 ? `${lines[0].title_snapshot} and ${more} more` : lines[0].title_snapshot;
  };
  const fmt = (m) => {
    const abs = Math.abs(m);
    return `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  };
  const date = (d) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const chip = (o) => {
    let s = o.status === "confirmed" ? "Confirmed" : o.status === "cancelled" ? "Cancelled" : "Pending";
    if (o.payment_status === "invoiced") s += ", invoiced";
    if (o.fulfilment_status === "fulfilled") s += " and delivered";
    return s;
  };
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Orders", "data-astro-cid-fdv6b7ge": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 data-astro-cid-fdv6b7ge>Orders</h1> ${orders.length === 0 ? renderTemplate`<p class="empty card" data-astro-cid-fdv6b7ge>No orders yet.</p>` : renderTemplate`<ul class="order-rows" data-astro-cid-fdv6b7ge> ${orders.map((o) => renderTemplate`<li class="card" data-astro-cid-fdv6b7ge> <a class="mono"${addAttribute(`/account/orders/${o.number}`, "href")} data-astro-cid-fdv6b7ge>${o.number}</a> <div class="muted small" data-astro-cid-fdv6b7ge>${date(o.placed_at)}</div> <div data-astro-cid-fdv6b7ge>${lineSummary(o)}</div> <div class="tnum" data-astro-cid-fdv6b7ge>${fmt(o.total_minor)}</div> <span class="chip" data-astro-cid-fdv6b7ge>${chip(o)}</span> </li>`)} </ul>`}` })} `;
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
